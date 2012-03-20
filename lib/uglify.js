var uglifycss = require('uglifycss');
var uglifyjs = require('uglify-js');
var jsp = uglifyjs.parser;
var pro = uglifyjs.uglify;

module.exports = {
  js: function(str, opt) {
    var ast = jsp.parse(str);
    ast = pro.ast_mangle(ast);
    ast = pro.ast_squeeze(ast);
    return pro.gen_code(ast, { ascii_only: true });
  },
  css: function(str, opt) {
    if (opt && opt.removals) {
      str.replace(opt.removals, '');
      delete opt.removals;
    }
    return uglifycss.processString(str, opt);
  }
};
