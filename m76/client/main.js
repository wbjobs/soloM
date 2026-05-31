const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { encrypt, decrypt, searchBlindIndex, deriveBlindIndexKey } = require('./crypto');
const { SearchIndex } = require('./search');
const axios = require('axios');

let mainWindow;
let notesDir = path.join(app.getPath('userData'), 'notes');
let backupDir = path.join(app.getPath('userData'), 'notes_backup');
let configPath = path.join(app.getPath('userData'), 'config.json');
const searchIndex = new SearchIndex();

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function calculateChecksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
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
    try {
      fs.unlinkSync(tempPath);
    } catch (e) {}
    throw new Error('Atomic write verification failed: ' + verifyError.message);
  }
  
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch (e) {}
  }
  
  try {
    fs.renameSync(tempPath, filePath);
  } catch (renameError) {
    try {
      fs.unlinkSync(tempPath);
    } catch (e) {}
    throw renameError;
  }
  
  try {
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (e) {}
}

function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      return readJsonFile(configPath);
    } catch (e) {
      const backupPath = configPath + '.bak';
      if (fs.existsSync(backupPath)) {
        try {
          return readJsonFile(backupPath);
        } catch (e2) {}
      }
    }
  }
  return { serverUrl: 'http://localhost:3000', userId: null };
}

function saveConfig(config) {
  writeJsonFileAtomic(configPath, config);
}

function validateNoteData(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.ciphertext !== 'string') return false;
  if (typeof data.salt !== 'string') return false;
  if (typeof data.iv !== 'string') return false;
  if (typeof data.timestamp !== 'number') return false;
  return true;
}

function recoverNoteFromBackup(notePath) {
  const backupPath = notePath + '.bak';
  if (fs.existsSync(backupPath)) {
    try {
      const data = readJsonFile(backupPath);
      if (validateNoteData(data)) {
        return data;
      }
    } catch (e) {}
  }
  return null;
}

function createWindow() {
  ensureDirExists(notesDir);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('save-note', async (event, { noteId, content, password }) => {
  try {
    ensureDirExists(notesDir);
    ensureDirExists(backupDir);
    
    const encrypted = encrypt(content, password);
    const notePath = path.join(notesDir, `${noteId}.json`);
    
    writeJsonFileAtomic(notePath, encrypted);
    
    return { success: true, timestamp: encrypted.timestamp };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-note', async (event, { noteId, password }) => {
  try {
    const notePath = path.join(notesDir, `${noteId}.json`);
    if (!fs.existsSync(notePath)) {
      return { success: true, content: '' };
    }
    
    let encryptedData = null;
    let recovered = false;
    
    try {
      encryptedData = readJsonFile(notePath);
      if (!validateNoteData(encryptedData)) {
        throw new Error('Invalid note data structure');
      }
    } catch (readError) {
      const recoveredData = recoverNoteFromBackup(notePath);
      if (recoveredData) {
        encryptedData = recoveredData;
        recovered = true;
        writeJsonFileAtomic(notePath, encryptedData);
      } else {
        throw new Error('Note file is corrupted and no backup available: ' + readError.message);
      }
    }
    
    const content = decrypt(encryptedData, password);
    return { 
      success: true, 
      content, 
      timestamp: encryptedData.timestamp,
      recovered: recovered
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-notes', async () => {
  try {
    ensureDirExists(notesDir);
    const files = fs.readdirSync(notesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    return { success: true, notes: files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-note', async (event, noteId) => {
  try {
    const notePath = path.join(notesDir, `${noteId}.json`);
    if (fs.existsSync(notePath)) {
      fs.unlinkSync(notePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-notes', async (event, { password, serverUrl, userId }) => {
  try {
    const config = loadConfig();
    const url = serverUrl || config.serverUrl;
    const user = userId || config.userId || 'default';
    
    if (serverUrl || userId) {
      saveConfig({ ...config, serverUrl: url, userId: user });
    }

    ensureDirExists(notesDir);
    ensureDirExists(backupDir);
    
    const localNotes = {};
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const noteId = file.replace('.json', '');
      const notePath = path.join(notesDir, file);
      try {
        localNotes[noteId] = readJsonFile(notePath);
        if (!validateNoteData(localNotes[noteId])) {
          const recovered = recoverNoteFromBackup(notePath);
          if (recovered) {
            localNotes[noteId] = recovered;
          } else {
            delete localNotes[noteId];
          }
        }
      } catch (e) {
        const recovered = recoverNoteFromBackup(notePath);
        if (recovered) {
          localNotes[noteId] = recovered;
        }
      }
    }

    const syncBackupDir = path.join(backupDir, `sync_${Date.now()}`);
    ensureDirExists(syncBackupDir);
    
    for (const [noteId, noteData] of Object.entries(localNotes)) {
      const backupPath = path.join(syncBackupDir, `${noteId}.json`);
      try {
        writeJsonFileAtomic(backupPath, noteData);
      } catch (e) {}
    }

    let response;
    try {
      response = await axios.post(`${url}/sync`, {
        userId: user,
        notes: localNotes
      }, {
        timeout: 30000
      });
    } catch (networkError) {
      return { 
        success: false, 
        error: 'Network error: ' + networkError.message + '. Local data is safe.',
        backupDir: syncBackupDir
      };
    }

    if (!response.data || !response.data.notes || typeof response.data.notes !== 'object') {
      return { 
        success: false, 
        error: 'Invalid server response format',
        backupDir: syncBackupDir
      };
    }

    const serverNotes = response.data.notes;
    const mergedNotes = { ...localNotes };
    const updatedNotes = [];

    for (const [noteId, serverNote] of Object.entries(serverNotes)) {
      if (!validateNoteData(serverNote)) {
        continue;
      }
      
      if (!localNotes[noteId] || serverNote.timestamp > localNotes[noteId].timestamp) {
        updatedNotes.push({ noteId, serverNote });
      }
    }

    for (const { noteId, serverNote } of updatedNotes) {
      try {
        if (password) {
          decrypt(serverNote, password);
        }
      } catch (decryptError) {
        continue;
      }
      
      try {
        mergedNotes[noteId] = serverNote;
        const notePath = path.join(notesDir, `${noteId}.json`);
        writeJsonFileAtomic(notePath, serverNote);
      } catch (writeError) {
        console.error(`Failed to write note ${noteId}:`, writeError);
      }
    }

    try {
      const filesToClean = fs.readdirSync(syncBackupDir);
      for (const f of filesToClean) {
        fs.unlinkSync(path.join(syncBackupDir, f));
      }
      fs.rmdirSync(syncBackupDir);
    } catch (e) {}

    return { 
      success: true, 
      syncedCount: Object.keys(mergedNotes).length,
      updatedCount: updatedNotes.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-config', async () => {
  return loadConfig();
});

ipcMain.handle('rebuild-search-index', async (event, password) => {
  try {
    ensureDirExists(notesDir);
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'));
    
    const notesData = {};
    for (const file of files) {
      const noteId = file.replace('.json', '');
      const notePath = path.join(notesDir, file);
      try {
        notesData[noteId] = readJsonFile(notePath);
      } catch (e) {
        console.warn(`Failed to read note ${noteId}:`, e.message);
      }
    }
    
    searchIndex.setPassword(password);
    const stats = await searchIndex.buildIndex(notesData);
    
    return { success: true, ...stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('search-notes', async (event, query, options) => {
  try {
    const results = searchIndex.search(query, options);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-search-index', async () => {
  searchIndex.clear();
  return { success: true };
});

ipcMain.handle('search-blind-index', async (event, { query, password }) => {
  try {
    ensureDirExists(notesDir);
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json'));
    
    if (!files.length) {
      return { success: true, results: [] };
    }
    
    const blindIndexes = {};
    for (const file of files) {
      const noteId = file.replace('.json', '');
      const notePath = path.join(notesDir, file);
      try {
        const noteData = readJsonFile(notePath);
        if (noteData.blindIndex) {
          blindIndexes[noteId] = noteData.blindIndex;
        }
      } catch (e) {
        console.warn(`Failed to read note ${noteId}:`, e.message);
      }
    }
    
    const firstNotePath = path.join(notesDir, files[0]);
    const firstNote = readJsonFile(firstNotePath);
    const blindKey = deriveBlindIndexKey(password, firstNote.salt);
    
    const results = searchBlindIndex(query, blindKey, blindIndexes);
    
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-search-index', async (event, { noteId, content, password }) => {
  try {
    if (!searchIndex.password) {
      searchIndex.setPassword(password);
    }
    
    const encrypted = encrypt(content, password);
    const title = decodeURIComponent(noteId);
    const fullText = title + ' ' + content;
    
    const { extractKeywords } = require('./crypto');
    const keywords = extractKeywords(fullText.toLowerCase());
    
    searchIndex.notes.set(noteId, {
      title,
      content,
      timestamp: encrypted.timestamp
    });
    
    for (const keyword of keywords) {
      if (!searchIndex.index.has(keyword)) {
        searchIndex.index.set(keyword, new Set());
      }
      searchIndex.index.get(keyword).add(noteId);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
