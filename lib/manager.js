/**
* manage the static files version, use etags
*/

var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var url = require('url');

var normalize = path.normalize;
var pjoin = path.join;

var uglify = require('./uglify');
var reg_css = /\.css$/;
var reg_css_js = /\.(css|js)$/;
//var reg_require = /(?:require\("(.+?)(\?.+?)?"\))/;

var DEBUG = process.env.DEBUG;

var debug = require('debug')('autostatic');

// to save etags
var t_save;

function Manager() {
  this.readies = {};
  this.oldEtags = {};
  this.etags = {};
  return this;
}

var remote_readies = {};

Manager.prototype.getEtag = function getEtag(p) {
  var self = this;
  var filepath = self.dir + p;
  var etags = self.etags;

  if (etags.hasOwnProperty(p)) return etags[p];

  // if we need to check hash
  if (self.checkHash) {
    // try minify this file, then run hash check
    self.minify(p);
    return etags[p] || (+new Date).toString();
  }

  fs.stat(filepath, function(err, st) {
    if (err || !st) {
      debug('Error when stat file: ', p, err);
      return;
    }

    // directory always returns a 'dir'
    if (st.isDirectory()) {
      //p += '/index.html';
      //return self.getEtag(p);
      return 'dir';
    }

    var etag = etags[p] = genStatEtag(st);

    // try compare with old etag,
    // and decide whether to compile this file or not
    if (self.oldEtags[p] !== etag) {
      debug('new version of static file:', p);
      // automatically minify this file (and upload)
      self.minify(p);
    } else {
      self.markReady(p);
    }
  });

  return etags[p] || (+new Date).toString();
};

// generate the minified version of a static file
Manager.prototype.minify = function minify(p, fn) {
  var self = this;
  var filepath = self.dir + p;

  // ignore minified file
  if (~p.indexOf('.min.')) return;

  process.nextTick(function() {
    fs.readFile(filepath, function(err, buffer) {
      if (err) {
        debug('Error when reading file', p, err);
        return;
      }

      var ft = p.split('.').pop();
      var m_p = self.getMin(p);
      if (ft == 'css' || ft == 'js') {
        buffer = buffer.toString();
        buffer = uglify[ft](buffer);

        //if (ft == 'js') {
          //var ver;
          //buffer = buffer.replace(reg_require, function(p0, p1) {
            //var file = pjoin(p, './', p1);
            //console.log(file);
            //ver = self.getEtag(file);
            //if (ver) {
              //return p1 + '?' + ver;
            //}
            //return p0;
          //});

          //// if require file version updated
          //if (ver) {
            //self.etags[p] = ver;
          //}
        //}

        // write to minified
        fs.writeFile(self.dir + m_p, buffer, function(err) {
          if (err) {
            debug('Error when write minified version of ', p, err);
          } else {
            self.markReady(p);
            self.markReady(m_p);
          }
        });
      }

      var hash;

      if (self.checkHash) {
        hash = self.etags[p] = self.etags[m_p] = makeHash(buffer);
        if (hash !== self.oldEtags[p]) {
          debug('new version of static file:', p);
        }
      }

      if (self.upload) {
        // upload compressed contents to remote
        self.upload(p, buffer, function() {
            self.markRemoteReady(p);
        }, hash);
      }

      try {
        clearTimeout(t_save);
      } catch (e) {}
      t_save = setTimeout(function() {
        self.saveEtags();
      }, 1000);
    });
  });
};

//Manager.prototype.minifyStream = function(stream, fn) {
//};

// you can rewrite this method for your own need
Manager.prototype.upload = function upload(p, buffer, fn, hash) {
  // do nothing
  this.markRemoteReady(p);
};

Manager.prototype.loadEtags = function loadEtags(hashTable) {
  var self = this;
  if (typeof hashTable === 'object') return self.oldEtags = self.etags.__proto__ = hashTable;

  var file = self.dir + '/.file_etags';
  fs.readFile(file, 'utf-8', function(err, data) {
    if (err) {
      debug(err);
      return;
    }

    var oldEtags;
    try {
      oldEtags = JSON.parse(data);
    } catch (e) {
      debug(e);
    }
    if (oldEtags) {
      self.etags.__proto__ = self.oldEtags = oldEtags;
    }
  });
};

Manager.prototype.saveEtags = function saveEtags() {
  var obj = {};
  // copy all the etags
  for (var i in this.etags) {
    obj[i] = this.etags[i];
  }
  fs.writeFile(this.dir + '/.file_etags', JSON.stringify(obj), 'utf-8');
};

Manager.prototype.compileAll = function compileAll(dir) {
  var self = this;
  dir = dir || self.dir;
  fs.readdir(dir, function(err, files) {
    if (err) {
      throw err;
      return;
    }
    files.forEach(function(item, i) {
      var file = dir + '/' + item;
      var p = file.replace(self.dir, '');
      var etag = self.getEtag(p);
      if (etag == 'dir') {
        self.compileAll(file);
      }
    });
  });
};

Manager.prototype.dir = process.cwd() + '/public';

var isWindows = process.platform === 'win32';
Manager.prototype.startWatch = function(p) {
  var self = this;
  var filepath = self.dir + p;
  if (isWindows) {
    self.watcher = fs.watch(filepath, function(event, filename) {
      if (event == 'change' && filename) {
        self.minify(p);
      }
    });
  } else {
    fs.watchFile(filepath, function(oldStat, newStat) {
      self.minify(p);
    });
  }
};
Manager.prototype.unwatch = function(p) {
  var self = this;
  if (self.watcher) return self.watcher.close();
  fs.unwatchFile(p);
};


Manager.prototype.isReady = function(p) {
  return this.readies[p];
};

/**
* Test if the file on a remote host is ready
*
* @param {string} p - the path to the file, relative to directory root.
* @param {string} hash - local file content md5 to compare.
* @param {function} fn - comparation callback.
*/
Manager.prototype.isRemoteReady = function(p, etag, fn) {
  var self = this;
  var checkHash = self.checkHash;
  var checkRemoteEtag = self.checkRemoteEtag;
  if (checkHash && !etag) {
    etag = self.getEtag(p);
  }

  var uri = self.root + p;

  if (uri in remote_readies) {
    var t = remote_readies[uri];

    if (typeof t == 'number') {
      // odd number means it's loading
      if (t % 2) {
        fn && fn(false);
        return false;
      }

      // retried 8 times
      if (t > 16) return 0;
      // otherwise we will try again
    } else {
      fn && fn(t);
      return t;
    }
  }

  remote_readies[uri] = (uri in remote_readies) ? remote_readies[uri] : 0;

  if ('function' == typeof self.checkRemote) {
    remote_readies[uri]++;
    self.checkRemote(p, etag, function(result) {
      if (result === true) {
        remote_readies[uri] = true;
      } else {
        remote_readies[uri]++;
      }
      fn && fn(result);
    });
    return false;
  }

  process.nextTick(function() {
    remote_readies[uri]++;

    var info = url.parse(uri);

    if (!info.host) return;

    info.headers = {
      Referer: info.href
    };

    info.method = checkHash ? 'GET' : 'HEAD';

    http.request(info, function(res) {
      var ret = remote_readies[uri] + 1;

      if (res.statusCode == 200) {

        if (checkHash) {
          var content = '';
          res.on('data', function(chunk) {
            content += chunk;
          });
          res.on('end', function() {
            var remote_hash = makeHash(content);
            var result = remote_hash === etag;
            if (result) {
              debug(uri, remote_hash, '- match -', etag);
            } else {
              debug(uri, remote_hash, '- MISS MATCH -', etag);
            }
            ret = result ? true : ret + 1;
            remote_readies[uri] = ret;
            fn && fn(ret);
          });
          return;
        }

        if (checkRemoteEtag) {
          if (typeof checkRemoteEtag != 'function') {
            checkRemoteEtag = function(hds, ret) {
              var remote_etag = hds['etag'];
              
              if (remote_etag && remote_etag == etag) {
                ret = true;
              } else if (hds['last-modified']) {
                var mtime = +new Date(hds['last-modified']);
                var size = hds['content-length'];
                var tmp = etag.split('-');

                // has the same size, and mtime is within 30 seconds
                if (Math.abs(tmp[0] - new Date(hds['Last-Modified'])) < 30000 && size == tmp[1]) {
                  ret = true;
                }
              }
              return ret;
            }
            ret = checkRemoteEtag(res.headers, ret);
          }
        } else {
          // is ready!
          ret = true;
        }
      }

      remote_readies[uri] = ret;

      fn && fn(ret);
    }).on('error', function(e) {
      console.error('[REMOTE STATIC]', uri, e);
    }).end();
  });

  return false;
};
// so we have the minified version ready
Manager.prototype.markReady = function(p, info) {
  this.readies[p] = info || true;
};
// mark a remote file as ready
Manager.prototype.markRemoteReady = function(p, info) {
  remote_readies[this.root + p] = info || true;
};

// get the minified path of the file
Manager.prototype.getMin = function(filepath) {
  return filepath.replace(reg_css_js, '.min.$1');
};

function genStatEtag(st) {
  return st.size + '-' + (+st.mtime);
}

// try get the first exsiting file
function tryFiles() {
  var files = Array.prototype.slice.call(arguments);
  var len = files.length;
  var stat;
  for (; i < len; i++) {
    if (path.exsitsSync(files[i])) break;
  }
  return files[i];
}

function makeHash(buff) {
  var md5sum = crypto.createHash('md5');
  md5sum.update(buff, 'utf8');
  return md5sum.digest('hex');
}

module.exports = Manager;
