const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nesAPI', {
    openROM: () => ipcRenderer.invoke('nes:openROM'),
    reset: () => ipcRenderer.invoke('nes:reset'),
    stepFrame: () => ipcRenderer.invoke('nes:stepFrame'),
    stepBySamples: (samples) => ipcRenderer.invoke('nes:stepBySamples', samples),
    getFrameBuffer: () => ipcRenderer.invoke('nes:getFrameBuffer'),
    getAudioSamples: () => ipcRenderer.invoke('nes:getAudioSamples'),
    clearAudioSamples: () => ipcRenderer.invoke('nes:clearAudioSamples'),
    setButton: (button, pressed) => ipcRenderer.invoke('nes:setButton', button, pressed),
    isLoaded: () => ipcRenderer.invoke('nes:isLoaded'),
    saveState: () => ipcRenderer.invoke('nes:saveState'),
    loadState: (stateData) => ipcRenderer.invoke('nes:loadState', stateData),
    getGameHash: () => ipcRenderer.invoke('nes:getGameHash'),
    getGameTitle: () => ipcRenderer.invoke('nes:getGameTitle'),
    getPlaytime: () => ipcRenderer.invoke('nes:getPlaytime'),
    getCurrentFrameImage: () => ipcRenderer.invoke('nes:getCurrentFrameImage'),
});
