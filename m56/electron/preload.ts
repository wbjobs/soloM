import { contextBridge, ipcRenderer } from 'electron'
import type { SystemData, RecordingState, ExportResult } from '../src/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getSystemData: (): Promise<SystemData> => ipcRenderer.invoke('get-system-data'),
  setAlertThreshold: (threshold: number): Promise<boolean> => 
    ipcRenderer.invoke('set-alert-threshold', threshold),
  onSystemData: (callback: (data: SystemData) => void) => {
    ipcRenderer.on('system-data', (_, data) => callback(data))
  },
  removeSystemDataListener: () => {
    ipcRenderer.removeAllListeners('system-data')
  },
  startRecording: (): Promise<{ success: boolean; maxDurationMs: number }> =>
    ipcRenderer.invoke('start-recording'),
  stopRecording: (): Promise<{ success: boolean; sampleCount: number }> =>
    ipcRenderer.invoke('stop-recording'),
  getRecordingState: (): Promise<RecordingState> =>
    ipcRenderer.invoke('get-recording-state'),
  exportTrace: (): Promise<ExportResult> =>
    ipcRenderer.invoke('export-trace'),
})

declare global {
  interface Window {
    electronAPI: {
      getSystemData: () => Promise<SystemData>
      setAlertThreshold: (threshold: number) => Promise<boolean>
      onSystemData: (callback: (data: SystemData) => void) => void
      removeSystemDataListener: () => void
      startRecording: () => Promise<{ success: boolean; maxDurationMs: number }>
      stopRecording: () => Promise<{ success: boolean; sampleCount: number }>
      getRecordingState: () => Promise<RecordingState>
      exportTrace: () => Promise<ExportResult>
    }
  }
}
