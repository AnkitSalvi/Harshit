const { list } = require('@vercel/blob');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var filePath = req.query.file;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing file parameter' });
  }

  try {
    var blobs = await list({ prefix: filePath });
    var blob = blobs.blobs.find(function (b) { return b.pathname === filePath; });

    if (!blob) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Private blobs require token for fetch
    var token = process.env.BLOB_READ_WRITE_TOKEN;
    var fetchUrl = blob.downloadUrl || blob.url;
    var response = await fetch(fetchUrl, {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch blob' });
    }

    res.setHeader('Content-Type', blob.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    var buffer = Buffer.from(await response.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    console.error('Media proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
};
