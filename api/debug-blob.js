const { list, head } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    var blobs = await list({ prefix: 'cms/' });
    var details = [];

    for (var i = 0; i < blobs.blobs.length; i++) {
      var b = blobs.blobs[i];
      var meta = null;
      try {
        meta = await head(b.url);
      } catch (e) {
        meta = { error: e.message };
      }
      details.push({
        pathname: b.pathname,
        url: b.url,
        downloadUrl: b.downloadUrl || 'N/A',
        size: b.size,
        uploadedAt: b.uploadedAt,
        headResult: meta ? {
          url: meta.url,
          downloadUrl: meta.downloadUrl || 'N/A',
          contentType: meta.contentType,
          size: meta.size,
        } : null
      });
    }

    return res.json({
      blobCount: blobs.blobs.length,
      blobs: details
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
