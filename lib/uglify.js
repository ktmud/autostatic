var cleancss = require('clean-css');
var uglifyjs = require('uglify-js');

module.exports = {
  js: function(code) {
    return uglifyjs.minify(code, { fromString: true, }).code;
  },
  css: function(code) {
    return cleancss.process(code);
  }
};
