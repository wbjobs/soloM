import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database(path.join(__dirname, 'documents.db'));

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_data BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC)
`);

const LARGE_DOCUMENT_THRESHOLD = 1024 * 1024;

const sanitizeForStorage = (text) => {
  if (typeof text !== 'string') return text;
  
  return text
    .replace(/\u0000/g, '')
    .normalize('NFC');
};

const encodeContent = (content) => {
  try {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);
    return Buffer.from(encoded.buffer);
  } catch (error) {
    console.warn('TextEncoder 不可用，使用原始字符串:', error.message);
    return Buffer.from(content, 'utf-8');
  }
};

const decodeContent = (buffer) => {
  try {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  } catch (error) {
    console.warn('TextDecoder 不可用，使用 Buffer 解码:', error.message);
    return buffer.toString('utf-8');
  }
};

const storeLargeContent = async (documentId, content) => {
  const chunkSize = 512 * 1024;
  const encoded = encodeContent(content);
  
  db.prepare('DELETE FROM document_chunks WHERE document_id = ?').run(documentId);
  
  const insertStmt = db.prepare(`
    INSERT INTO document_chunks (document_id, chunk_index, chunk_data)
    VALUES (?, ?, ?)
  `);
  
  const insertMany = db.transaction((chunks) => {
    for (const chunk of chunks) {
      insertStmt.run(chunk.documentId, chunk.index, chunk.data);
    }
  });
  
  const chunks = [];
  for (let i = 0; i < encoded.length; i += chunkSize) {
    chunks.push({
      documentId,
      index: Math.floor(i / chunkSize),
      data: encoded.slice(i, i + chunkSize)
    });
  }
  
  insertMany(chunks);
};

const retrieveLargeContent = (documentId) => {
  const chunks = db.prepare(`
    SELECT chunk_data, chunk_index
    FROM document_chunks
    WHERE document_id = ?
    ORDER BY chunk_index ASC
  `).all(documentId);
  
  if (chunks.length === 0) return null;
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.chunk_data.length, 0);
  const combined = Buffer.concat(chunks.map(c => c.chunk_data), totalLength);
  
  return decodeContent(combined);
};

app.use(cors());
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf.toString('utf-8'));
    } catch (e) {
      throw new Error('Invalid JSON encoding - ensure UTF-8 encoding');
    }
  }
}));

app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.get('/api/documents', (req, res) => {
  try {
    const documents = db.prepare(`
      SELECT id, title, created_at, updated_at,
             LENGTH(content) as content_length
      FROM documents
      ORDER BY updated_at DESC
    `).all();
    
    const docsWithPreviews = documents.map(doc => {
      const isLarge = doc.content_length > LARGE_DOCUMENT_THRESHOLD;
      let contentPreview = '';
      
      if (isLarge) {
        const fullContent = retrieveLargeContent(doc.id);
        contentPreview = fullContent ? fullContent.substring(0, 100) : '';
      } else {
        const fullDoc = db.prepare('SELECT content FROM documents WHERE id = ?').get(doc.id);
        contentPreview = fullDoc ? fullDoc.content.substring(0, 100) : '';
      }
      
      return {
        ...doc,
        content: contentPreview,
        is_large: isLarge
      };
    });
    
    res.json(docsWithPreviews);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents', details: error.message });
  }
});

app.get('/api/documents/:id', (req, res) => {
  try {
    const document = db.prepare(`
      SELECT id, title, content, created_at, updated_at,
             LENGTH(content) as content_length
      FROM documents
      WHERE id = ?
    `).get(req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const isLarge = document.content_length > LARGE_DOCUMENT_THRESHOLD;
    
    if (isLarge) {
      const fullContent = retrieveLargeContent(document.id);
      if (fullContent) {
        document.content = fullContent;
      }
    }
    
    document.is_large = isLarge;
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document', details: error.message });
  }
});

app.post('/api/documents', (req, res) => {
  try {
    let { title, content } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    title = sanitizeForStorage(title);
    content = sanitizeForStorage(content);
    
    const isLarge = Buffer.byteLength(content, 'utf-8') > LARGE_DOCUMENT_THRESHOLD;
    
    const result = db.prepare(`
      INSERT INTO documents (title, content)
      VALUES (?, ?)
    `).run(title, isLarge ? '[LARGE_CONTENT_STORED_IN_CHUNKS]' : content);
    
    const docId = result.lastInsertRowid;
    
    if (isLarge) {
      storeLargeContent(docId, content);
    }
    
    const document = db.prepare(`
      SELECT id, title, content, created_at, updated_at
      FROM documents
      WHERE id = ?
    `).get(docId);
    
    if (isLarge) {
      document.content = content;
      document.is_large = true;
    }
    
    document.id = docId;
    res.status(201).json(document);
  } catch (error) {
    console.error('Error creating document:', error);
    
    if (error.message.includes('SQLITE_ERROR') || error.message.includes('encoding')) {
      return res.status(400).json({ 
        error: 'Encoding error - please ensure your content uses valid UTF-8 encoding',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Failed to create document', details: error.message });
  }
});

app.put('/api/documents/:id', (req, res) => {
  try {
    let { title, content } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    title = sanitizeForStorage(title);
    content = sanitizeForStorage(content);
    
    const isLarge = Buffer.byteLength(content, 'utf-8') > LARGE_DOCUMENT_THRESHOLD;
    
    const result = db.prepare(`
      UPDATE documents
      SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, isLarge ? '[LARGE_CONTENT_STORED_IN_CHUNKS]' : content, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const docId = parseInt(req.params.id);
    
    if (isLarge) {
      storeLargeContent(docId, content);
    } else {
      db.prepare('DELETE FROM document_chunks WHERE document_id = ?').run(docId);
    }
    
    const document = db.prepare(`
      SELECT id, title, content, created_at, updated_at
      FROM documents
      WHERE id = ?
    `).get(docId);
    
    if (isLarge) {
      document.content = content;
      document.is_large = true;
    }
    
    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    
    if (error.message.includes('SQLITE_ERROR') || error.message.includes('encoding')) {
      return res.status(400).json({ 
        error: 'Encoding error - please ensure your content uses valid UTF-8 encoding',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Failed to update document', details: error.message });
  }
});

app.delete('/api/documents/:id', (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM documents
      WHERE id = ?
    `).run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document', details: error.message });
  }
});

app.get('/api/health', (req, res) => {
  try {
    const dbStatus = db.prepare('SELECT 1 as ok').get();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected' : 'error',
      encoding: 'UTF-8'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

app.post('/api/test-emoji', (req, res) => {
  try {
    const { text } = req.body;
    
    const testResult = db.prepare(`
      INSERT INTO documents (title, content)
      VALUES (?, ?)
    `).run('Emoji Test 🧪', text || '测试 Emoji: 😀🎉🚀💻📱🎮🍕🌍❤️⭐');
    
    const inserted = db.prepare(`
      SELECT id, title, content
      FROM documents
      WHERE id = ?
    `).get(testResult.lastInsertRowid);
    
    res.json({
      success: true,
      message: 'Emoji storage test successful',
      original: text || '测试 Emoji: 😀🎉🚀💻📱🎮🍕🌍❤️⭐',
      retrieved: inserted.content,
      match: inserted.content === (text || '测试 Emoji: 😀🎉🚀💻📱🎮🍕🌍❤️⭐')
    });
  } catch (error) {
    console.error('Emoji test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 Markdown Editor Backend Server                       ║
║                                                          ║
║   📍 Server running on: http://localhost:${PORT}        ║
║                                                          ║
║   🔧 Configuration:                                     ║
║      • Database: SQLite (WAL mode)                        ║
║      • Encoding: UTF-8 (Emoji support ✅)                  ║
║      • Max request size: 50MB                           ║
║      • Large doc threshold: 1MB (chunked storage)         ║
║                                                          ║
║   📄 API Endpoints:                                    ║
║      GET    /api/documents       - List all documents        ║
║      GET    /api/documents/:id   - Get document         ║
║      POST   /api/documents       - Create document        ║
║      PUT    /api/documents/:id   - Update document      ║
║      DELETE /api/documents/:id   - Delete document      ║
║      GET    /api/health            - Health check           ║
║      POST   /api/test-emoji        - Emoji storage test     ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
