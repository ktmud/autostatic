= AutoStatic =

Automatically serve static files, with version control (etag support), compression and CDN support. This makes it possible to skip all the annoying packaging process when deploying your application.

== Usage ==

```javascript
var express = require('express');
var autostatic = require('autostatic');

var app = express.createServer();

app.helpers({
  static: autostatic({ root: 'http://img.example.com' }).serve,
});
```

Then you can set up a assets server (`img.example.com`) in Nginx or Apache,
with your public files directory as `root` or `DocumentRoot`.

Or, you can set up automatically upload to CDN like this:

```javascript

var as = autostatic({
  root: 'http://img1.xxcdn.com',
  upload: function(path, contents) {
    // your upload method
  }
});

app.helpers({
  static: as.serve
});
```
