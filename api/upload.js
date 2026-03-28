const { put } = require('@vercel/blob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel serverless receives the file as a raw body when using multipart
    // We need to handle the multipart form data manually
    var contentType = req.headers['content-type'] || '';

    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    // Collect the raw body
    var chunks = [];
    await new Promise(function (resolve, reject) {
      req.on('data', function (chunk) { chunks.push(chunk); });
      req.on('end', resolve);
      req.on('error', reject);
    });
    var buffer = Buffer.concat(chunks);

    // Parse boundary from content-type
    var boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'No boundary found' });
    }
    var boundary = boundaryMatch[1] || boundaryMatch[2];

    // Parse the multipart data to extract the file
    var parsed = parseMultipart(buffer, boundary);
    if (!parsed) {
      return res.status(400).json({ error: 'No file found in upload' });
    }

    // Generate a unique filename
    var ext = getExtension(parsed.filename || parsed.contentType);
    var filename = Date.now() + '-' + Math.random().toString(36).substring(2, 9) + ext;
    var blobPath = 'uploads/' + filename;

    // Upload to Vercel Blob
    var blob = await put(blobPath, parsed.data, {
      contentType: parsed.contentType,
      addRandomSuffix: false
    });

    // Return a proxy path that our /api/media endpoint can serve
    return res.json({ filename: filename, path: '/api/media?file=' + encodeURIComponent(blobPath) });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
};

function parseMultipart(buffer, boundary) {
  var boundaryBuf = Buffer.from('--' + boundary);
  var parts = [];
  var start = 0;

  while (true) {
    var idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (start > 0) {
      parts.push(buffer.slice(start, idx - 2)); // -2 for \r\n before boundary
    }
    start = idx + boundaryBuf.length + 2; // +2 for \r\n after boundary
  }

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    var headers = part.slice(0, headerEnd).toString();
    var data = part.slice(headerEnd + 4);

    // Check if this is the file part
    var filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!filenameMatch) continue;

    var ctMatch = headers.match(/Content-Type:\s*(.+)/i);
    var contentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    return {
      filename: filenameMatch[1],
      contentType: contentType,
      data: data
    };
  }

  return null;
}

function getExtension(filenameOrType) {
  // Try from filename
  var extMatch = filenameOrType.match(/\.([a-zA-Z0-9]+)$/);
  if (extMatch) return '.' + extMatch[1].toLowerCase();

  // From content type
  var map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov'
  };
  return map[filenameOrType] || '.bin';
}
