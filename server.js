const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

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

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filename: req.file.filename, path: `/uploads/${req.file.filename}` });
});

// Save content
app.post('/api/content', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
