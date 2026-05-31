const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceInfo: () => ipcRenderer.invoke('device:getInfo'),
  getPeers: () => ipcRenderer.invoke('peers:getList'),
  refreshDiscovery: () => ipcRenderer.invoke('discovery:refresh'),
  selectFiles: () => ipcRenderer.invoke('files:select'),
  selectFolder: () => ipcRenderer.invoke('files:selectFolder'),
  sendFile: (targetIp, targetPort, filePath) =>
    ipcRenderer.invoke('file:send', { targetIp, targetPort, filePath }),
  resumeFile: (transferId, targetIp, targetPort, filePath, fileName, fileSize) =>
    ipcRenderer.invoke('file:resume', { transferId, targetIp, targetPort, filePath, fileName, fileSize }),
  acceptTransfer: (transferId, savePath) =>
    ipcRenderer.invoke('transfer:accept', { transferId, savePath }),
  rejectTransfer: (transferId) =>
    ipcRenderer.invoke('transfer:reject', { transferId }),
  openFolder: (folderPath) =>
    ipcRenderer.invoke('folder:open', folderPath),
  getDirname: (filePath) =>
    ipcRenderer.invoke('path:getDirname', filePath),

  onPeerDiscovered: (callback) => {
    ipcRenderer.on('peer:discovered', (event, peer) => callback(peer))
  },
  onPeerLost: (callback) => {
    ipcRenderer.on('peer:lost', (event, peerId) => callback(peerId))
  },
  onTransferProgress: (callback) => {
    ipcRenderer.on('transfer:progress', (event, progress) => callback(progress))
  },
  onTransferComplete: (callback) => {
    ipcRenderer.on('transfer:complete', (event, result) => callback(result))
  },
  onTransferError: (callback) => {
    ipcRenderer.on('transfer:error', (event, error) => callback(error))
  },
  onIncomingTransfer: (callback) => {
    ipcRenderer.on('transfer:incoming', (event, request) => callback(request))
  },

  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('peer:discovered')
    ipcRenderer.removeAllListeners('peer:lost')
    ipcRenderer.removeAllListeners('transfer:progress')
    ipcRenderer.removeAllListeners('transfer:complete')
    ipcRenderer.removeAllListeners('transfer:error')
    ipcRenderer.removeAllListeners('transfer:incoming')
  }
})
