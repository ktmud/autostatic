/**
* manage the static files version, use etags
*/

var crypto = require('crypto');
var path = require('path');
var fs = require('fs');

var uglify = require('./uglify');

var etags = {};
var old_etags = {};

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

function getEtag(p) {
  var filepath = manager.dir + p;

  var etag = etags[filepath];

  // when new etag is found, return it
  if (etag) return etag;

  var st = path.existsSync(filepath) && fs.statSync(filepath);
  etag = etags[filepath] = st && [st.ino, +st.mtime, st.size].join('-');

  // try get the old etag,
  // and decide whether to compile manager file or not
  var old_etag = old_etags[filepath];
  if (old_etag !== etag) {
    console.log('== found new version of static file:', p);
    process.nextTick(function() {
      minify(p);
    });
  }

  // try return
  return etag;
}

var reg_css = /\.css$/;

// generate the minified version of a static file
function minify(p, contents) {
  var filepath = manager.dir + p;
  var exists = path.existsSync(filepath);

  if (!exists) return;

  var buffer = contents || fs.readFileSync(filepath);

  var ft = filepath.split('.').slice(-1)[0];
  if (ft == 'css' || ft == 'js') {
    buffer = uglify[ft](buffer.toString());
  }

  // write to minified
  fs.writeFile(manager.dir + manager.getMin(p), buffer);

  // upload compressed file contents to remote
  manager.upload && manager.upload(p, buffer);

  saveEtags();
}

function loadEtags(hash) {
  if (hash) return old_etags = hash;

  var file = manager.dir + '/.file_etags';
  path.exsistsSync(file) && fs.readFile(file, 'utf-8', function(err, data) {
    if (err) throw err;
    try {
      old_etags = JSON.parse(data);
    } catch (e) {}
  });
}

function saveEtags() {
  fs.writeFile(manager.dir + '/.file_etags', JSON.stringify(etags), 'utf-8');
}

process.on('exit', function() {
  saveEtags();
});

var manager = {
  dir: process.cwd() + '/public',
  getEtag: getEtag,
  // get the minified path of the file
  getMin: function makeMin(filepath) {
    var tmp = filepath.split('.');
    var ext = tmp.pop();
    tmp.push('min');
    tmp.push(ext);
    return tmp.join('.');
  },
  loadEtags: loadEtags,
  upload: function() {
    // upload to cdn
  },
  minify: minify,
  saveEtags: saveEtags
};

module.exports = manager;
