import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file natively if it exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
  console.log('📄 Loaded environment variables from .env');
} else {
  console.log('ℹ️ No .env file found. Create a .env file with GEMINI_API_KEY and SUPABASE keys.');
}

// Dynamically import API serverless handlers
import chatHandler from './api/chat.js';
import ingestHandler from './api/ingest.js';

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Enhance res with Express/Vercel-like helper methods
  res.status = function (statusCode) {
    this.statusCode = statusCode;
    return this;
  };

  res.json = function (data) {
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(data));
    return this;
  };

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Route API Calls
  if (pathname === '/api/chat') {
    return handleApiRequest(req, res, chatHandler);
  }

  if (pathname === '/api/ingest') {
    return handleApiRequest(req, res, ingestHandler);
  }

  // 2. Serve Static Frontend Files
  let filePath = '';
  if (pathname === '/admin' || pathname === '/admin.html') {
    filePath = path.join(__dirname, 'admin.html');
  } else if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else {
    // Check if file exists in root or public/
    const directPath = path.join(__dirname, pathname);
    const publicPath = path.join(__dirname, 'public', pathname);

    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      filePath = directPath;
    } else if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
      filePath = publicPath;
    } else {
      filePath = path.join(__dirname, 'index.html');
    }
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server Error: ' + err.message);
  }
});

async function handleApiRequest(req, res, handler) {
  let bodyStr = '';
  req.on('data', chunk => {
    bodyStr += chunk;
  });

  req.on('end', async () => {
    try {
      req.body = bodyStr ? JSON.parse(bodyStr) : {};
    } catch (e) {
      req.body = {};
    }

    try {
      await handler(req, res);
    } catch (err) {
      console.error('API Error:', err);
      if (!res.writableEnded) {
        res.status(500).json({ error: err.message || 'Internal API Error' });
      }
    }
  });
}

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SRM College RAG Assistant is running locally!`);
  console.log(`👉 Open in your browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
