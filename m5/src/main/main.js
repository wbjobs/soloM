const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const crypto = require('crypto');

let mainWindow = null;
let nesEmulator = null;
let currentRomPath = '';
let currentRomHash = '';
let currentRomTitle = '';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 760,
        minWidth: 512,
        minHeight: 480,
        title: 'NES Emulator',
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
    }
}

function initNesNative() {
    try {
        const nesCore = require('../../build/Release/nes_core.node');
        nesEmulator = new nesCore.NesEmulator();
        console.log('Loaded native C++ NES core');
        return true;
    } catch (err) {
        console.log('Native NES core not available, falling back to JavaScript implementation');
        try {
            const { NesEmulator } = require('../native/js-fallback');
            nesEmulator = new NesEmulator();
            console.log('Loaded JavaScript NES core (fallback)');
            return true;
        } catch (err2) {
            console.error('Failed to load any NES core:', err2);
            return false;
        }
    }
}

function calculateRomHash(filePath) {
    try {
        const fs = require('fs');
        const data = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(data).digest('hex');
    } catch (e) {
        return '';
    }
}

function setupIpc() {
    ipcMain.handle('nes:openROM', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            filters: [{ name: 'NES ROM', extensions: ['nes'] }],
            properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false };
        const romPath = result.filePaths[0];
        try {
            const success = nesEmulator.loadROM(romPath);
            if (success) {
                currentRomPath = romPath;
                currentRomHash = calculateRomHash(romPath);
                currentRomTitle = path.basename(romPath, '.nes');
                try { nesEmulator.clearAudioSamples(); } catch (e) {}
            }
            return { success, gameHash: currentRomHash, gameTitle: currentRomTitle };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('nes:reset', () => {
        if (nesEmulator) nesEmulator.reset();
    });

    ipcMain.handle('nes:stepFrame', () => {
        if (nesEmulator) nesEmulator.stepFrame();
    });

    ipcMain.handle('nes:stepBySamples', (_, samples) => {
        if (!nesEmulator) return { frame: null, audio: null, frameReady: false };
        nesEmulator.stepBySamples(samples);
        const frame = nesEmulator.getFrameBuffer();
        let audio = null;
        try { audio = nesEmulator.getAudioSamples(); } catch (e) {}
        const frameReady = nesEmulator.bus ? nesEmulator.bus.ppu.frame_complete() : false;
        return { frame, audio, frameReady };
    });

    ipcMain.handle('nes:getFrameBuffer', () => {
        if (!nesEmulator) return null;
        return nesEmulator.getFrameBuffer();
    });

    ipcMain.handle('nes:getAudioSamples', () => {
        if (!nesEmulator) return null;
        return nesEmulator.getAudioSamples();
    });

    ipcMain.handle('nes:clearAudioSamples', () => {
        if (nesEmulator) nesEmulator.clearAudioSamples();
    });

    ipcMain.handle('nes:setButton', (_, button, pressed) => {
        if (nesEmulator) nesEmulator.setButton(button, pressed);
    });

    ipcMain.handle('nes:isLoaded', () => {
        if (!nesEmulator) return false;
        return nesEmulator.isLoaded();
    });

    ipcMain.handle('nes:saveState', () => {
        if (!nesEmulator || !nesEmulator.isLoaded()) {
            return { success: false, error: 'No ROM loaded' };
        }
        try {
            const state = nesEmulator.saveState();
            return { success: true, state };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('nes:loadState', (_, stateData) => {
        if (!nesEmulator) {
            return { success: false, error: 'Emulator not initialized' };
        }
        try {
            nesEmulator.loadState(stateData);
            nesEmulator.clearAudioSamples();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('nes:getGameHash', () => currentRomHash);
    ipcMain.handle('nes:getGameTitle', () => currentRomTitle);

    ipcMain.handle('nes:getCurrentFrameImage', () => {
        if (!nesEmulator) return null;
        const frameBuf = nesEmulator.getFrameBuffer();
        if (!frameBuf) return null;
        return Buffer.from(frameBuf).toString('base64');
    });
}

app.whenReady().then(() => {
    initNesNative();
    setupIpc();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
