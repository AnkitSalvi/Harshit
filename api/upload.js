const fs = require('fs');
const path = require('path');

const uploadsDir = path.join('/tmp', 'uploads');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // For Vercel serverless, file uploads via multipart are available in req.body
    // But without a proper multipart parser, we return a placeholder
    // Persistent file storage requires Vercel Blob or external storage
    return res.status(501).json({
      error: 'File uploads require external storage (e.g. Vercel Blob). Not supported in serverless /tmp.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
