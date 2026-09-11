const auth = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  if (!auth.checkCredentials(body.username, body.password)) {
    // Slow failures down a little so the form can't be hammered quickly
    await new Promise(function (resolve) { setTimeout(resolve, 600); });
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  res.setHeader('Set-Cookie', auth.loginCookie(req));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true });
};
