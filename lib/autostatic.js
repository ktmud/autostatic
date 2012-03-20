var manager = require('./manager');

var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var url = require('url');
var Buffer = require('buffer').Buffer;

var Stream = require('stream').Stream;

var reg_css = /\.css$/;
var reg_css_js = /\.(css|js)$/;

var dir = manager.dir; // local folder
var uri_root = ''; // assets uri root
var direct = '';
var debug = false;

var checkRemote = false;
var readies = {};

var compile_css = 'less';

// as express middleware
// must be used before using the `express.static` middleware
var autostatic = function(root, options) {

  options = options || {};
  // it's directory root
  options.root = root;

  var send = autostatic.static.send;

  autostatic.set(options);

  return function(req, res, next) {
    options.path = req.url;
    options.getOnly = true;

    //if (!reg_css_js.test(req.url)) return send(req, res, next, options);

    var ver = manager.getEtag(req.url);

    //if (!ver) return next(404);

    return send(req, res, next, options);
  }
};

autostatic.serve = function(p) {
  if (debug) return direct + p;

  // for css files, try less and stylus
  //if (compile_css && reg_css.test(p)) {
    //p = p.replace(reg_css, '.' + compile_css);
  //}

  var isReady = !checkRemote || autostatic.remoteHas(p);

  var ver = manager.getEtag(p);

  if (isReady) return uri_root + p + '?' + ver;

  return direct + p;
};

autostatic.manager = manager;

// load file version hashes from local public directory
// or you can pass on a hashset you read from a database
autostatic.loadEtags = manager.loadEtags;

// mark a remote file as ready
autostatic.markReady = function(p, info) {
  readies[p] = info || 1;
};

// test if we can get file from remote cdn
autostatic.remoteHas = function(p) {
  if (p in readies) {
    var t = readies[p];
    if (typeof t == 'number') {
      // retry 5 times
      if (t > 5) return true;
    } else {
      return !!t;
    }
  }

  var info = url.parse(uri_root);

  var options = {
    host: info.hostname,
    port: info.port || 80,
    path: (info.pathname + p).replace('//', '/'),
    headers: {
      Referer: info.href
    },
    method: 'HEAD'
  };

  http.request(options, function(res) {
    if (res.statusCode == 200) {
      readies[p] = true;
    } else {
      readies[p] = (p in readies) ? readies[p] + 1 : 1;
    }
  }).on('error', function(e) {
    throw e;
  }).end();
};

autostatic.set = function setOption(options) {
  if (!options) return;

  uri_root = options.uri_root || uri_root;
  direct = options.direct || direct;
  debug = options.debug || debug;
  compile_css = options.compile_css || compile_css;

  // this file is served from remote cdn
  manager.checkRemote = checkRemote = options.checkRemote || checkRemote;

  manager.dir = options.root || root;
  if ('upload' in options) manager.upload = options.upload;
};

var reg_min_files = /\.min\.css/;

// clean local folder compiled files
autostatic.clean = function cleanDir(dir) {
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

module.exports = autostatic;
