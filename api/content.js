const { put, list } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

const CONTENT_BLOB_NAME = 'cms/content.json';

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      var token = process.env.BLOB_READ_WRITE_TOKEN;

      // Try Vercel Blob first
      if (token) {
        try {
          var blobs = await list({ prefix: 'cms/content', token: token });
          var contentBlob = blobs.blobs.find(function (b) {
            return b.pathname === CONTENT_BLOB_NAME;
          });

          if (contentBlob) {
            // Use the blob URL with cache-busting to avoid stale CDN responses
            var fetchUrl = contentBlob.url;
            var sep = fetchUrl.includes('?') ? '&' : '?';
            fetchUrl += sep + '_t=' + Date.now();

            var response = await fetch(fetchUrl, {
              headers: { 'Authorization': 'Bearer ' + token },
              cache: 'no-store'
            });

            if (response.ok) {
              var data = await response.json();
              // Set no-cache headers on our response too
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
              return res.json(data);
            }
          }
        } catch (e) {
          console.error('Blob read error:', e.message);
        }
      }

      // Fallback: read from bundled file
      var bundledPath = path.join(__dirname, '..', 'data', 'content.json');
      if (fs.existsSync(bundledPath)) {
        var fileData = JSON.parse(fs.readFileSync(bundledPath, 'utf-8'));
        return res.json(fileData);
      }

      return res.json({ pages: {} });
    }

    if (req.method === 'POST') {
      var body = req.body;
      var jsonStr = JSON.stringify(body, null, 2);

      var blob = await put(CONTENT_BLOB_NAME, jsonStr, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      // Return no-cache headers
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.json({ success: true, url: blob.url });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Content API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
