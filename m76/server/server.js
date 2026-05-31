const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'data_backup');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return JSON.parse(content);
}

function writeJsonFileAtomic(filePath, data) {
  const tempPath = filePath + '.tmp';
  const backupPath = filePath + '.bak';
  
  ensureDirExists(path.dirname(filePath));
  
  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, '\uFEFF' + jsonContent, 'utf8');
  
  try {
    const verifyData = readJsonFile(tempPath);
    if (JSON.stringify(verifyData) !== JSON.stringify(data)) {
      throw new Error('Data verification failed after write');
    }
  } catch (verifyError) {
    try { fs.unlinkSync(tempPath); } catch (e) {}
    throw new Error('Atomic write verification failed: ' + verifyError.message);
  }
  
  if (fs.existsSync(filePath)) {
    try { fs.copyFileSync(filePath, backupPath); } catch (e) {}
  }
  
  try {
    fs.renameSync(tempPath, filePath);
  } catch (renameError) {
    try { fs.unlinkSync(tempPath); } catch (e) {}
    throw renameError;
  }
  
  try {
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (e) {}
}

function validateNoteData(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.ciphertext !== 'string') return false;
  if (typeof data.salt !== 'string') return false;
  if (typeof data.iv !== 'string') return false;
  if (typeof data.timestamp !== 'number') return false;
  return true;
}

function getUserDataPath(userId) {
  return path.join(DATA_DIR, `${userId}.json`);
}

function loadUserData(userId) {
  const userPath = getUserDataPath(userId);
  if (fs.existsSync(userPath)) {
    try {
      return readJsonFile(userPath);
    } catch (e) {
      const backupPath = userPath + '.bak';
      if (fs.existsSync(backupPath)) {
        try {
          const data = readJsonFile(backupPath);
          writeJsonFileAtomic(userPath, data);
          return data;
        } catch (e2) {}
      }
    }
  }
  return { notes: {} };
}

function saveUserData(userId, data) {
  const userPath = getUserDataPath(userId);
  writeJsonFileAtomic(userPath, data);
}

app.get('/', (req, res) => {
  res.json({ 
    name: 'Encrypted Notes Sync Server',
    version: '1.0.0',
    status: 'running'
  });
});

app.post('/sync', (req, res) => {
  try {
    const { userId, notes } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (typeof notes !== 'object' || notes === null) {
      return res.status(400).json({ error: 'Invalid notes data' });
    }
    
    ensureDirExists(DATA_DIR);
    ensureDirExists(BACKUP_DIR);
    
    const userData = loadUserData(userId);
    const serverNotes = userData.notes || {};
    
    const mergedNotes = { ...serverNotes };
    
    for (const [noteId, clientNote] of Object.entries(notes || {})) {
      if (!validateNoteData(clientNote)) {
        console.warn(`Invalid note data for note ${noteId}, skipping`);
        continue;
      }
      
      if (!serverNotes[noteId] || clientNote.timestamp > serverNotes[noteId].timestamp) {
        mergedNotes[noteId] = clientNote;
      }
    }
    
    saveUserData(userId, { notes: mergedNotes });
    
    res.json({
      success: true,
      notes: mergedNotes,
      syncedCount: Object.keys(mergedNotes).length
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.get('/notes/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const userData = loadUserData(userId);
    
    res.json({
      success: true,
      notes: userData.notes || {},
      count: Object.keys(userData.notes || {}).length
    });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/search-blind', (req, res) => {
  try {
    const { userId, queryHashes } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!Array.isArray(queryHashes) || queryHashes.length === 0) {
      return res.status(400).json({ error: 'queryHashes array is required' });
    }
    
    const userData = loadUserData(userId);
    const notes = userData.notes || {};
    const results = [];
    
    for (const [noteId, noteData] of Object.entries(notes)) {
      if (!noteData.blindIndex || !noteData.blindIndex.hashes) {
        continue;
      }
      
      let matchCount = 0;
      const noteHashes = noteData.blindIndex.hashes;
      
      for (const qh of queryHashes) {
        if (noteHashes.includes(qh)) {
          matchCount++;
        }
      }
      
      if (matchCount > 0) {
        results.push({
          noteId,
          matchCount,
          score: matchCount / queryHashes.length,
          timestamp: noteData.timestamp
        });
      }
    }
    
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.timestamp - a.timestamp;
    });
    
    res.json({
      success: true,
      results: results.slice(0, 50)
    });
  } catch (error) {
    console.error('Blind search error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Encrypted Notes Sync Server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
