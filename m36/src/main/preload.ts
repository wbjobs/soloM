import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => {
      const validChannels = [
        'syscall:event',
        'syscall:batch',
        'heatmap:update',
        'processtree:update',
        'stats:update',
        'collector:status',
        'collector:error',
        'collector:dropped',
        'security:alerts',
      ]
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, callback)
      }
    },
    invoke: (channel: string, ...args: any[]) => {
      const validChannels = [
        'collector:start',
        'collector:stop',
        'collector:status',
        'config:get',
        'config:set',
        'data:export',
        'audit:getLogs',
        'audit:getStats',
        'audit:acknowledgeAlert',
        'audit:acknowledgeAllAlerts',
        'audit:cleanupOldLogs',
      ]
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args)
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`))
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback)
    },
  },
})
