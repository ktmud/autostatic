/**
* manage the static files version, use etags
*/

var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var url = require('url');

var uglify = require('./uglify');
var reg_css = /\.css$/;
var reg_css_js = /\.(css|js)$/;

function Manager() {
  this.readies = {};
  this.etags = {};
  this.oldEtags = {};
  return this;
}

var remote_readies = {};
// test if we can get file from remote cdn
Manager.remoteHas = function remoteHas(uri) {
  if (uri in remote_readies) {
    var t = remote_readies[uri];
    if (typeof t == 'number') {
      // retried 5 times
      if (t > 5) return false;
      // otherwise we will try again
    } else {
      return t;
    }
  }

  process.nextTick(function() {
    var info = url.parse(uri);

    if (!info.host) return;

    info.headers = {
      Referer: info.href
    };
    info.method = 'HEAD';

    http.request(info, function(res) {
      if (res.statusCode == 200) {
        remote_readies[uri] = true;
      } else {
        remote_readies[uri] = (uri in remote_readies) ? remote_readies[uri] + 1 : 1;
      }
    }).on('error', function(e) {
      console.error('[REMOTE STATIC]', uri);
      throw e;
    }).end();
  });

  return false;
};

Manager.prototype.getEtag = function getEtag(p) {
  var self = this;
  var filepath = self.dir + p;
  var etags = self.etags;

  // when the etag is found, return it
  // Attention, we only read the etag once
  if (p in etags) return etags[p];

  // generate etag based on file stats
  var st = path.existsSync(filepath) && fs.statSync(filepath);

  // if file does not exists
  if (!st) {
    return '';
  }

  var etag = etags[p] = [st.ino, +st.mtime, st.size].join('-');

  // try compare with old etag,
  // and decide whether to compile file or not
  if (self.oldEtags[p] !== etag) {
    console.log('== found new version of static file:', p);
    // auto matically minify this file (and upload)
    self.minify(p);
  } else {
    self.markReady(p);
  }

  return etag;
};

// generate the minified version of a static file
Manager.prototype.minify = function minify(p, fn) {
  var self = this;
  var filepath = self.dir + p;

  path.exists(filepath, function(exists) {
    if (!exists) return;

    fs.readFile(filepath, function(err, buffer) {
      if (err) {
        throw err;
        return;
      }

      var ft = filepath.split('.').slice(-1)[0];
      if (ft == 'css' || ft == 'js') {
        buffer = uglify[ft](buffer.toString());
        // write to minified
        fs.writeFile(self.dir + self.getMin(p), buffer, function(err) {
          if (err) {
            throw err;
          } else {
            self.markReady(p);
          }
        });
      }

      // upload compressed file contents to remote
      self.upload && self.upload(p, buffer, function() {
        self.markRemoteReady(p);
        self.saveEtags();
      });
    });
  });
};

Manager.prototype.upload = function upload(p) {
  // do nothing
  this.markRemoteReady(p);
  this.saveEtags();
};

Manager.prototype.loadEtags = function loadEtags(hash) {
  var self = this;
  if (typeof hash === 'object') return self.oldEtags = hash;

  var file = self.dir + '/.file_etags';
  path.existsSync(file) && fs.readFile(file, 'utf-8', function(err, data) {
    if (err) throw err;
    try {
      self.oldEtags = JSON.parse(data);
    } catch (e) {}
  });
};

Manager.prototype.saveEtags = function saveEtags() {
  fs.writeFile(this.dir + '/.file_etags', JSON.stringify(this.etags), 'utf-8');
};

Manager.prototype.dir = process.cwd() + '/public';

// watch the public dir
//Manager.prototype.watch = function() {
  //fs.watch(this.dir, function(event, filename) {
    //console.log(event, filename);
  //});
//};

Manager.prototype.isReady = function(p) {
  return this.readies[p];
};
Manager.prototype.isRemoteReady = function(p) {
  return Manager.remoteHas(this.root + p);
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

function makeHash(fd) {
  var md5sum = crypto.createHash('md5');
  md5sum.update(string, 'utf8');
  return md5sum.digest('hex');
}

module.exports = Manager;
