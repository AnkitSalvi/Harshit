const { put, list, head } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

const CONTENT_BLOB_NAME = 'cms/content.json';

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      // Try Vercel Blob first
      try {
        var blobs = await list({ prefix: 'cms/content' });
        var contentBlob = blobs.blobs.find(function (b) {
          return b.pathname === CONTENT_BLOB_NAME;
        });

        if (contentBlob) {
          // Private blobs require the token for fetch
          var token = process.env.BLOB_READ_WRITE_TOKEN;
          var fetchUrl = contentBlob.downloadUrl || contentBlob.url;
          var response = await fetch(fetchUrl, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
          });
          if (response.ok) {
            var data = await response.json();
            return res.json(data);
          }
        }
      } catch (e) {
        console.error('Blob read error:', e.message);
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
        allowOverwrite: true
      });

      return res.json({ success: true, url: blob.url });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Content API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
