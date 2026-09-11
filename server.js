const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('./api/_auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Middleware
app.use(express.json({ limit: '5mb' }));

// Clean URL for the admin login page (mirrors the rewrite in vercel.json)
app.get('/dashboard-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard-login.html'));
});

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// --- Admin auth ---
app.post('/api/login', async (req, res) => {
  const body = req.body || {};
  if (!auth.checkCredentials(body.username, body.password)) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  res.setHeader('Set-Cookie', auth.loginCookie(req));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', auth.logoutCookie(req));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true });
});

app.get('/api/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ authenticated: auth.isAuthenticated(req) });
});

// Upload endpoint — admin only
app.post('/api/upload', (req, res, next) => {
  if (auth.requireAuth(req, res)) return;
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filename: req.file.filename, path: `/uploads/${req.file.filename}` });
});

// Save content — admin only
app.post('/api/content', (req, res) => {
  if (auth.requireAuth(req, res)) return;

  const contentPath = path.join(dataDir, 'content.json');
  fs.writeFileSync(contentPath, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// Load content
app.get('/api/content', (req, res) => {
  const contentPath = path.join(dataDir, 'content.json');
  if (fs.existsSync(contentPath)) {
    const data = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
    res.json(data);
  } else {
    res.json({ pages: {} });
  }
});

// Media proxy (for consistency with Vercel /api/media?file=path)
app.get('/api/media', (req, res) => {
  const filePath = req.query.file;
  if (!filePath) return res.status(400).json({ error: 'Missing file parameter' });

  // Serve from local uploads directory
  const localPath = path.join(__dirname, filePath);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  return res.status(404).json({ error: 'File not found' });
});

// --- Static files (after the API routes, so only unmatched paths get here) ---

// Without this guard express.static would hand out the server's own source,
// including the admin credentials in api/_auth.js.
const PRIVATE_PATHS = /^\/(api|node_modules|\.|server\.js|package(-lock)?\.json|vercel\.json)/;
app.use((req, res, next) => {
  if (PRIVATE_PATHS.test(req.path)) return res.status(404).send('Not found');
  next();
});

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
