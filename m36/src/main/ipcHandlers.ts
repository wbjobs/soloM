import type { IpcMain } from 'electron'
import type { AppConfig, CollectorStatus } from '@shared/types'

interface IpcHandlerContext {
  startCollector: (config: AppConfig) => Promise<boolean>
  stopCollector: () => Promise<boolean>
  getConfig: () => AppConfig
  setConfig: (config: AppConfig) => boolean
  getCollectorStatus: () => CollectorStatus
  exportData: (options: any) => string
}

export function setupIpcHandlers(ipcMain: IpcMain, context: IpcHandlerContext) {
  ipcMain.handle('collector:start', async (_event, config: AppConfig) => {
    return context.startCollector(config)
  })

  ipcMain.handle('collector:stop', async () => {
    return context.stopCollector()
  })

  ipcMain.handle('collector:status', () => {
    return context.getCollectorStatus()
  })

  ipcMain.handle('config:get', () => {
    return context.getConfig()
  })

  ipcMain.handle('config:set', (_event, config: AppConfig) => {
    return context.setConfig(config)
  })

  ipcMain.handle('data:export', (_event, options: any) => {
    return context.exportData(options)
  })
}
