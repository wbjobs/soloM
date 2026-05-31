const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use((req, res, next) => {
  const ext = path.extname(req.url).toLowerCase();
  if (ext === '.wasm') {
    res.setHeader('Content-Type', 'application/wasm');
  } else if (ext === '.dcm') {
    res.setHeader('Content-Type', 'application/dicom');
  }
  next();
});

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  fs.mkdirSync(publicPath, { recursive: true });
}

app.use(express.static(publicPath, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.wasm') {
      res.setHeader('Content-Type', 'application/wasm');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
  }
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'DICOM Viewer Server is running' });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  DICOM Viewer Server`);
  console.log(`========================================`);
  console.log(`  Local: http://localhost:${PORT}`);
  console.log(`  Press Ctrl+C to stop`);
  console.log(`========================================\n`);
});
