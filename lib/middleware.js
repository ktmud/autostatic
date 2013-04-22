var fs = require('fs');
var path = require('path');

module.exports = function() {
  var self = this;
  var manager = self.manager;
  return function(req, res, next) {
    var p = req.url;

    var tmp = p.split('??');
    if (tmp[0] === self.route && tmp[1]) {
      files = tmp[1].split(',');

      function tick(i) {
        var f = files[i];

        if (!f) {
          return res.end();
        }

        if (!self.debug) {
          if (manager.isReady(f)) {
            f = manager.getMin(f);
          } else {
            manager.minify(f);
          }
        }

        var stream = fs.createReadStream(path.join(self.dir, f));
        stream.on('error', function(e) {
          console.error(e.stack);
          res.end('\n\n[ERROR] Read file "' + f + '" failed.');
        });
        stream.on('data', function(data) {
          res.write(data);
        });
        stream.on('end', function() {
          tick(i+1);
        });
      }

      res.type(path.extname(files[0]));

      if (!self.debug) {
         res.setHeader('Cache-Control', 'public, max-age=' + (self.maxAge / 1000));
      }

      tick(0);

      return;
    }

    req.on('static', function(stream) {
      if (!stream) return;

      var tmp = p.split('?');

      console.log(stream);

      if (tmp[1]) return;

      // the path
      p = tmp[0].split(',');

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
