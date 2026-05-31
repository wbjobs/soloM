const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { createDiscoveryService } = require('./udp-discovery')
const { createTcpServer, sendFile, resumeFile } = require('./tcp-server')

let mainWindow = null
let discoveryService = null
let tcpServer = null
let deviceName = os.hostname()

const getLocalIpAddress = () => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

const localIp = getLocalIpAddress()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: '局域网 P2P 文件传输'
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  discoveryService = createDiscoveryService({
    deviceName,
    localIp,
    onPeerDiscovered: (peer) => {
      if (mainWindow) {
        mainWindow.webContents.send('peer:discovered', peer)
      }
    },
    onPeerLost: (peerId) => {
      if (mainWindow) {
        mainWindow.webContents.send('peer:lost', peerId)
      }
    }
  })
  discoveryService.start()

  tcpServer = createTcpServer({
    localIp,
    onTransferProgress: (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:progress', progress)
      }
    },
    onTransferComplete: (result) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:complete', result)
      }
    },
    onTransferError: (error) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:error', error)
      }
    },
    onIncomingRequest: (request) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:incoming', request)
      }
    }
  })
  tcpServer.start().then(() => {
    if (discoveryService) {
      discoveryService.setTcpPort(tcpServer.getPort())
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (discoveryService) {
    discoveryService.stop()
  }
  if (tcpServer) {
    tcpServer.stop()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('device:getInfo', () => {
  return {
    name: deviceName,
    ip: localIp,
    port: tcpServer ? tcpServer.getPort() : 0
  }
})

ipcMain.handle('peers:getList', () => {
  return discoveryService ? discoveryService.getPeers() : []
})

ipcMain.handle('discovery:refresh', () => {
  if (discoveryService) {
    discoveryService.refresh()
  }
  return true
})

ipcMain.handle('files:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiFile'],
    title: '选择要发送的文件'
  })
  if (result.canceled || result.filePaths.length === 0) {
    return []
  }
  const files = []
  for (const filePath of result.filePaths) {
    try {
      const stats = fs.statSync(filePath)
      files.push({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size
      })
    } catch (err) {
      console.error('获取文件信息失败:', err)
    }
  }
  return files
})

ipcMain.handle('files:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择保存位置'
  })
  return result.filePaths[0] || ''
})

ipcMain.handle('file:send', async (event, { targetIp, targetPort, filePath }) => {
  const transferId = Date.now().toString()
  sendFile({
    transferId,
    targetIp,
    targetPort,
    filePath,
    onProgress: (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:progress', progress)
      }
    },
    onComplete: (result) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:complete', result)
      }
    },
    onError: (error) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:error', error)
      }
    }
  })
  return transferId
})

ipcMain.handle('transfer:accept', (event, { transferId, savePath }) => {
  if (tcpServer) {
    tcpServer.acceptTransfer(transferId, savePath)
  }
  return true
})

ipcMain.handle('transfer:reject', (event, { transferId }) => {
  if (tcpServer) {
    tcpServer.rejectTransfer(transferId)
  }
  return true
})

ipcMain.handle('folder:open', (event, folderPath) => {
  shell.openPath(folderPath)
  return true
})

ipcMain.handle('path:getDirname', (event, filePath) => {
  return path.dirname(filePath)
})

ipcMain.handle('file:resume', async (event, { transferId, targetIp, targetPort, filePath, fileName, fileSize }) => {
  resumeFile({
    transferId,
    targetIp,
    targetPort,
    filePath,
    fileName,
    fileSize,
    onProgress: (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:progress', progress)
      }
    },
    onComplete: (result) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:complete', result)
      }
    },
    onError: (error) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer:error', error)
      }
    }
  })
  return true
})
