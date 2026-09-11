const auth = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Set-Cookie', auth.logoutCookie(req));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true });
};
