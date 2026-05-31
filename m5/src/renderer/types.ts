export interface StepBySamplesResult {
    frame: Buffer | null;
    audio: Int16Array | null;
    frameReady: boolean;
}

export interface SaveStateInfo {
    id: string;
    slot: number;
    gameHash: string;
    gameTitle: string;
    timestamp: number;
    thumbnail?: string;
    playtime: number;
    description?: string;
    syncStatus: 'local' | 'synced' | 'pending' | 'conflict';
    syncTimestamp?: number;
    checksum: string;
    version: number;
}

export interface SaveStateData {
    info: SaveStateInfo;
    state: any;
}

export interface SaveStateSlot {
    slot: number;
    save?: SaveStateInfo;
}

export interface CloudSyncStatus {
    enabled: boolean;
    lastSync?: number;
    pendingCount: number;
    totalCount: number;
    isSyncing: boolean;
    error?: string;
}

export interface SyncConflict {
    local: SaveStateInfo;
    remote: SaveStateInfo;
    resolution: 'keep-local' | 'keep-remote' | 'keep-both' | null;
}

declare global {
    interface Window {
        nesAPI: {
            openROM: () => Promise<{ success: boolean; error?: string }>;
            reset: () => Promise<void>;
            stepFrame: () => Promise<void>;
            stepBySamples: (samples: number) => Promise<StepBySamplesResult>;
            getFrameBuffer: () => Promise<Buffer | null>;
            getAudioSamples: () => Promise<Int16Array | null>;
            clearAudioSamples: () => Promise<boolean>;
            setButton: (button: number, pressed: boolean) => Promise<void>;
            isLoaded: () => Promise<boolean>;
            saveState: () => Promise<{ success: boolean; data?: SaveStateData; error?: string }>;
            loadState: (stateData: any) => Promise<{ success: boolean; error?: string }>;
            getGameHash: () => Promise<string>;
            getGameTitle: () => Promise<string>;
            getPlaytime: () => Promise<number>;
            getCurrentFrameImage: () => Promise<string>;
            listSaveStates: (gameHash?: string) => Promise<SaveStateInfo[]>;
            getSaveState: (id: string) => Promise<SaveStateData | null>;
            deleteSaveState: (id: string) => Promise<boolean>;
            updateSaveStateInfo: (id: string, info: Partial<SaveStateInfo>) => Promise<boolean>;
            quickSave: (slot: number) => Promise<{ success: boolean; save?: SaveStateInfo; error?: string }>;
            quickLoad: (slot: number) => Promise<{ success: boolean; error?: string }>;
            getCloudSyncStatus: () => Promise<CloudSyncStatus>;
            setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
            syncNow: () => Promise<{ success: boolean; error?: string }>;
            resolveConflict: (id: string, resolution: 'keep-local' | 'keep-remote' | 'keep-both') => Promise<boolean>;
        };
    }
}

export const BUTTON_A = 0;
export const BUTTON_B = 1;
export const BUTTON_SELECT = 2;
export const BUTTON_START = 3;
export const BUTTON_UP = 4;
export const BUTTON_DOWN = 5;
export const BUTTON_LEFT = 6;
export const BUTTON_RIGHT = 7;

export const AUDIO_SAMPLE_RATE = 44100;
export const AUDIO_BUFFER_SIZE = 2048;
export const AUDIO_TARGET_LATENCY = 0.05;
export const AUDIO_MIN_LATENCY = 0.02;
export const AUDIO_MAX_LATENCY = 0.2;

export const SAVE_STATE_VERSION = 1;
export const SAVE_STATE_SLOTS = 10;
export const AUTO_SAVE_INTERVAL = 60000;
