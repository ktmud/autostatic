var uglifycss = require('uglifycss');
var uglifyjs = require('uglify-js');
var jsp = uglifyjs.parser;
var pro = uglifyjs.uglify;

module.exports = {
  js: function(str, opt) {
    var ast = jsp.parse(str);
    ast = pro.ast_mangle(ast, { except: ['require', 'use'] });
    ast = pro.ast_squeeze(ast);
    return pro.gen_code(ast, { ascii_only: true });
  },
  css: function(str) {
    return uglifycss.processString(str, {
      maxLineLen: 8000
    });
  }
};
