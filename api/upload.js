module.exports = (req, res) => {
  // File uploads only work locally via Express server.
  // On Vercel, images are served from the committed /uploads/ directory.
  return res.status(403).json({
    error: 'File uploads are only available locally. Run: node server.js'
  });
};
