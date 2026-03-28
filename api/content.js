const { put, list, del } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

const BLOB_PREFIX = 'cms/content';

module.exports = async (req, res) => {
  var token = process.env.BLOB_READ_WRITE_TOKEN;

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

      // Try Vercel Blob first
      if (token) {
        try {
          var blobs = await list({ prefix: BLOB_PREFIX, token: token });
          // Find the most recent content blob
          var contentBlobs = blobs.blobs.filter(function (b) {
            return b.pathname.startsWith(BLOB_PREFIX);
          });

          if (contentBlobs.length > 0) {
            // Sort by uploadedAt descending to get latest
            contentBlobs.sort(function (a, b) {
              return new Date(b.uploadedAt) - new Date(a.uploadedAt);
            });

            var latest = contentBlobs[0];

            // Fetch content using Bearer auth
            var response = await fetch(latest.url, {
              headers: { 'Authorization': 'Bearer ' + token }
            });

            if (response.ok) {
              var data = await response.json();
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

      // Delete ALL old content blobs first
      try {
        var oldBlobs = await list({ prefix: BLOB_PREFIX, token: token });
        var toDelete = oldBlobs.blobs
          .filter(function (b) { return b.pathname.startsWith(BLOB_PREFIX); })
          .map(function (b) { return b.url; });
        if (toDelete.length > 0) {
          await del(toDelete, { token: token });
        }
      } catch (e) {
        console.error('Blob cleanup error:', e.message);
      }

      // Write new blob with random suffix — guarantees unique URL, no CDN cache
      var blob = await put(BLOB_PREFIX + '.json', jsonStr, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: true,
        token: token
      });

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.json({ success: true, url: blob.url });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Content API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
