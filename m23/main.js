const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { scanMarkdownFiles, buildLinkGraph, findIsolatedFiles } = require('./src/graph-builder');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
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

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  function buildTree(currentPath) {
    const items = fs.readdirSync(currentPath);
    const result = [];
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        result.push({
          name: item,
          path: fullPath,
          type: 'folder',
          children: buildTree(fullPath)
        });
      } else if (item.endsWith('.md')) {
        result.push({
          name: item,
          path: fullPath,
          type: 'file'
        });
      }
    }
    return result;
  }
  
  return buildTree(dirPath);
});

ipcMain.handle('read-file', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('save-file', async (event, filePath, content) => {
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('get-link-graph', async (event, folderPath) => {
  const files = scanMarkdownFiles(folderPath);
  return buildLinkGraph(files, folderPath);
});

ipcMain.handle('get-isolated-files', async (event, folderPath) => {
  return findIsolatedFiles(folderPath);
});
