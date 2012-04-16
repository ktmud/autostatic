# AutoStatic

Automatically serve static files, with version control (etag supported), compression and CDN support. This makes it possible to skip all the annoying packaging process when deploying your application.

You may also want to try a [inline static management module](https://github.com/ktmud/express-istatic).

## Usage

```javascript
var express = require('express');
var autostatic = require('autostatic');

var app = express.createServer();

var as = autostatic({ root: 'http://img.example.com' });

app.use(as.middleware()); // neccesary if you don't always use `static()` helper to insert file url
app.use(express.static(__dirname + '/public', conf.static_conf));

app.helpers({
  static: as.serve,
});
```
In template:

```html
<script src="${static('/js/abcd.js')}"></script>
```

this will output as:

```html
<script src="http://img.example.com/js/abcd.min.js?1234567-8900"></script>
```

The `abcd.min.js` file is generated by this module automatically. This is an asynchronous process, so it will
serve the original `/js/abcd.js` first, and cache control is handled by `express.static` middleware. Once the
minified version of this file is ready, minified file with etag as suffix (`/js/abcd.min.js?122456-123`) will
be served.

You can set up a unique domain for your assets (`img.example.com`), in Nginx or Apache,
with your public files directory as `root` or `DocumentRoot`.

Or, set up an `upload` method to deploy the compressed file to CDN like this:

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
