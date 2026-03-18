const fs = require('fs');
const path = require('path');

const contentPath = path.join('/tmp', 'content.json');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    if (fs.existsSync(contentPath)) {
      const data = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
      return res.json(data);
    }
    return res.json({ pages: {} });
  }

  if (req.method === 'POST') {
    fs.writeFileSync(contentPath, JSON.stringify(req.body, null, 2));
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
