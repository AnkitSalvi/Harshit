/**
 * Admin authentication shared by the local Express server (server.js) and the
 * Vercel serverless functions (api/*.js).
 *
 * Serverless functions are stateless, so instead of a server-side session store
 * we hand out an HMAC-signed cookie. Any instance holding the same secret can
 * verify it.
 *
 * The credentials below are the defaults. ADMIN_USERNAME, ADMIN_PASSWORD and
 * ADMIN_SESSION_SECRET override them when set in the environment (Vercel →
 * Settings → Environment Variables).
 */

const crypto = require('crypto');

const COOKIE_NAME = 'studio_admin';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // one week

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'gupsss';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gupsssmachadega';

// Without a configured secret, derive one from the credentials so every
// serverless instance agrees on it (a random per-process secret would log the
// admin out on each cold start). Changing the password invalidates sessions.
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || 'studio:' + ADMIN_USERNAME + ':' + ADMIN_PASSWORD;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkCredentials(username, password) {
  // Both comparisons always run, so a wrong username costs the same as a wrong password
  const userOk = safeEqual(username || '', ADMIN_USERNAME);
  const passOk = safeEqual(password || '', ADMIN_PASSWORD);
  return userOk && passOk;
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

/** token = base64url(payload).signature */
function createToken() {
  const payload = JSON.stringify({
    user: ADMIN_USERNAME,
    exp: Date.now() + MAX_AGE_SECONDS * 1000
  });
  const encoded = Buffer.from(payload).toString('base64url');
  return encoded + '.' + sign(encoded);
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(encoded))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!payload || typeof payload.exp !== 'number') return false;
    if (Date.now() > payload.exp) return false;
    // A password change rotates the derived secret, but check the user too
    return safeEqual(payload.user || '', ADMIN_USERNAME);
  } catch (e) {
    return false;
  }
}

function parseCookies(req) {
  const header = (req.headers && req.headers.cookie) || '';
  const out = {};
  header.split(';').forEach(function (part) {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    const key = part.slice(0, eq).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  });
  return out;
}

function isSecureRequest(req) {
  if (req.secure) return true;
  const proto = (req.headers && req.headers['x-forwarded-proto']) || '';
  return String(proto).split(',')[0].trim() === 'https';
}

function sessionCookie(req, token, maxAge) {
  const parts = [
    COOKIE_NAME + '=' + (token || ''),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + maxAge
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function loginCookie(req) {
  return sessionCookie(req, createToken(), MAX_AGE_SECONDS);
}

function logoutCookie(req) {
  return sessionCookie(req, '', 0);
}

/** True when the request carries a valid, unexpired admin session. */
function isAuthenticated(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

/**
 * Guard for write endpoints. Returns true when the response has already been
 * ended with a 401, so callers can `if (requireAuth(req, res)) return;`.
 */
function requireAuth(req, res) {
  if (isAuthenticated(req)) return false;
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not authorised' }));
  return true;
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  checkCredentials,
  isAuthenticated,
  requireAuth,
  loginCookie,
  logoutCookie,
  parseCookies
};
