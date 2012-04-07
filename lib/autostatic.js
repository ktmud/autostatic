var Manager = require('./manager');

var path = require('path');
var fs = require('fs');
var Buffer = require('buffer').Buffer;

var Stream = require('stream').Stream;

var reg_css = /\.css$/;
var reg_css_js = /\.(css|js)$/;
var reg_min_files = /\.min\./;

// @constructor
function AutoStatic(options) {
  var manager = this.manager = new Manager();
  this.dir = manager.dir; // local folder
  this.finalUrls = {};
  manager.loadEtags();
  if (options) this.set(options);
}

AutoStatic.prototype = {
  compile: 'less',
  checkRemote: true,
  checkLocal: true,
  root: '',
  direct: '',
  debug: false
};

//express middleware
AutoStatic.prototype.middleware = function() {
  var self = this;

  return function(req, res, next) {
    var p = req.url;

    req.on('static', function(stream) {
      if (!stream) return;

      var tmp = p.split('?');

      if (tmp[1]) return;

      // the path
      p = tmp[0];

      process.nextTick(function() {
        // get version of this file (and minify it)
        var etag = self.manager.getEtag(p);
        if (self.checkRemote) self.manager.isRemoteReady(p, etag);
      });

      //if (stream) self.minifyStream(stream);
    });

    return next();
  }
};

// this should be used as an express helper
Object.defineProperty(AutoStatic.prototype, 'serve', {
  get: function(p) {
    var self = this;
    var manager = self.manager;

    return function(p) {
      if (process.env.DEBUG || self.debug) return self.direct + p;

      return self.getUrl(p);
    }
  }
});

AutoStatic.prototype.getUrl = function getUrl(p) {
  var self = this;
  var manager = self.manager;

  if (self.finalUrls[p]) return self.finalUrls[p];

  // for css files, try less and stylus
  //if (compile_css && reg_css.test(p)) {
    //p = p.replace(reg_css, '.' + compile_css);
  //}

  var ret;

  // get the version of this file
  var ver = manager.getEtag(p);
  var _ver = ver ? '?' + ver : '';

  // if remote is ready, serve the remote file
  if (!self.checkRemote || manager.isRemoteReady(p, ver)) {
    ret = self.finalUrls[p] = self.root + p + _ver;
    return ret;
  }

  // if local is ready, serve the local minified version
  if (!self.checkLocal || manager.isReady(p)) {
    ret = self.finalUrls[p] = self.direct + manager.getMin(p) + ver;
    return ret;
  }

  // fallback to original content
  return self.direct + p;
};

AutoStatic.prototype.set = function setOption(options) {
  if (!options) return;

  for (var i in options) {
    // only change the available options
    if (i in this) {
      this[i] = options[i];
    }
  }

  var manager = this.manager;
  manager.dir = this.dir;
  manager.root = this.root;
  if ('checkHash' in options) manager.checkHash = options.checkHash;
  if ('watch' in options) manager.watch = options.watch;
  //if ('upload' in options) manager.upload = options.upload;
  //if ('checkRemoteEtag' in options) manager.checkRemoteEtag = options.checkRemoteEtag;
};

// clean local folder compiled files
AutoStatic.prototype.clean = function cleanDir(dir) {
  dir = dir || local_folder;
  fs.readdir(dir, function(err, files) {
    files.forEach(function(item) {
      var tmp = item.split('.');
      // can delete this file
      if (tmp.splice(-2, 1)[0] == 'min' && path.exsistsSync(dir + '/' + tmp.join('.'))) {
        fs.unlink(dir + '/' + item);
      } else {
        fs.stat(item, function(err, stat) {
          if (stat && stat.isDirectory()) {
            cleanDir(item);
          }
        });
      }
    });
  });
};

var exports = function(options) {
  return new AutoStatic(options);
};

exports.AutoStatic = AutoStatic;
exports.Manager = Manager;

module.exports = exports;
