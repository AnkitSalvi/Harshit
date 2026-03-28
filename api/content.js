const fs = require('fs');
const path = require('path');

// In production (Vercel), serve the bundled content.json (read-only).
// Writing only works locally via Express server.
const bundledPath = path.join(__dirname, '..', 'data', 'content.json');

module.exports = (req, res) => {
  try {
    if (req.method === 'GET') {
      if (fs.existsSync(bundledPath)) {
        const data = JSON.parse(fs.readFileSync(bundledPath, 'utf-8'));
        return res.json(data);
      }
      return res.json({ pages: {} });
    }

    // POST not supported on Vercel — editing is local-only
    if (req.method === 'POST') {
      return res.status(403).json({
        error: 'Content editing is only available locally. Run: node server.js'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
