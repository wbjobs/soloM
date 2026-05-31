import type { SaveStateInfo, SaveStateData, SaveStateSlot, CloudSyncStatus } from '../types';
import { SAVE_STATE_VERSION, SAVE_STATE_SLOTS } from '../types';
import { saveStateDB } from './SaveStateDatabase';
import { cloudSyncManager } from './CloudSyncManager';

function generateId(): string {
    return `save_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateChecksum(obj: any): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

export class SaveStateManager {
    currentGameHash: string = '';
    currentGameTitle: string = '';
    playtimeStart: number = 0;
    playtimeAccumulated: number = 0;
    onSlotsChange: ((slots: SaveStateSlot[]) => void) | null = null;
    onSyncStatusChange: ((status: CloudSyncStatus) => void) | null = null;

    constructor() {
        cloudSyncManager.setStatusCallback((status) => {
            if (this.onSyncStatusChange) {
                this.onSyncStatusChange(status);
            }
        });
    }

    setCurrentGame(hash: string, title: string): void {
        this.currentGameHash = hash;
        this.currentGameTitle = title;
        this.playtimeStart = Date.now();
        this.playtimeAccumulated = 0;
    }

    getPlaytime(): number {
        const current = this.playtimeStart > 0 ? Date.now() - this.playtimeStart : 0;
        return this.playtimeAccumulated + current;
    }

    pausePlaytime(): void {
        if (this.playtimeStart > 0) {
            this.playtimeAccumulated += Date.now() - this.playtimeStart;
            this.playtimeStart = 0;
        }
    }

    resumePlaytime(): void {
        if (this.playtimeStart === 0) {
            this.playtimeStart = Date.now();
        }
    }

    setSlotsChangeCallback(callback: (slots: SaveStateSlot[]) => void): void {
        this.onSlotsChange = callback;
    }

    setSyncStatusCallback(callback: (status: CloudSyncStatus) => void): void {
        this.onSyncStatusChange = callback;
        cloudSyncManager.setStatusCallback(callback);
    }

    async saveState(
        state: any,
        slot: number,
        options: { thumbnail?: string; description?: string } = {}
    ): Promise<{ success: boolean; save?: SaveStateInfo; error?: string }> {
        if (!this.currentGameHash) {
            return { success: false, error: 'No ROM loaded' };
        }

        try {
            const id = generateId();
            const checksum = calculateChecksum(state);
            const playtime = this.getPlaytime();

            const info: SaveStateInfo = {
                id,
                slot,
                gameHash: this.currentGameHash,
                gameTitle: this.currentGameTitle,
                timestamp: Date.now(),
                thumbnail: options.thumbnail,
                playtime,
                description: options.description,
                syncStatus: cloudSyncManager.isEnabled() ? 'pending' : 'local',
                checksum,
                version: SAVE_STATE_VERSION
            };

            const saveData: SaveStateData = { info, state };

            await saveStateDB.save(saveData);

            if (cloudSyncManager.isEnabled()) {
                cloudSyncManager.syncNow().catch(console.error);
            }

            await this.notifySlotsChange();

            return { success: true, save: info };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    async loadState(id: string): Promise<{ success: boolean; state?: any; error?: string }> {
        try {
            const saveData = await saveStateDB.getData(id);
            if (!saveData) {
                return { success: false, error: 'Save state not found' };
            }

            const checksum = calculateChecksum(saveData.state);
            if (checksum !== saveData.info.checksum) {
                return { success: false, error: 'Save state corrupted' };
            }

            if (saveData.info.version !== SAVE_STATE_VERSION) {
                return { success: false, error: `Incompatible save version: ${saveData.info.version}` };
            }

            return { success: true, state: saveData.state };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    async quickSave(slot: number, state: any, thumbnail?: string): Promise<{ success: boolean; save?: SaveStateInfo; error?: string }> {
        return this.saveState(state, slot, {
            thumbnail,
            description: `Quick save slot ${slot}`
        });
    }

    async quickLoad(slot: number): Promise<{ success: boolean; state?: any; error?: string }> {
        if (!this.currentGameHash) {
            return { success: false, error: 'No ROM loaded' };
        }

        const save = await saveStateDB.getBySlot(this.currentGameHash, slot);
        if (!save) {
            return { success: false, error: `No save in slot ${slot}` };
        }

        return this.loadState(save.id);
    }

    async listSaves(gameHash?: string): Promise<SaveStateInfo[]> {
        return saveStateDB.list(gameHash || this.currentGameHash);
    }

    async getSave(id: string): Promise<SaveStateData | null> {
        return saveStateDB.getData(id);
    }

    async deleteSave(id: string): Promise<boolean> {
        try {
            await saveStateDB.delete(id);
            
            if (cloudSyncManager.isEnabled()) {
                cloudSyncManager.syncNow().catch(console.error);
            }

            await this.notifySlotsChange();
            return true;
        } catch (e) {
            return false;
        }
    }

    async updateSaveInfo(id: string, updates: Partial<SaveStateInfo>): Promise<boolean> {
        const result = await saveStateDB.updateInfo(id, updates);
        
        if (result && cloudSyncManager.isEnabled() && updates.syncStatus !== 'synced') {
            await saveStateDB.updateInfo(id, { syncStatus: 'pending' });
            cloudSyncManager.syncNow().catch(console.error);
        }

        await this.notifySlotsChange();
        return result !== null;
    }

    async getSlots(): Promise<SaveStateSlot[]> {
        const slots: SaveStateSlot[] = [];
        const saves = this.currentGameHash ? await this.listSaves() : [];
        
        for (let i = 0; i < SAVE_STATE_SLOTS; i++) {
            const save = saves.find(s => s.slot === i);
            slots.push({ slot: i, save });
        }
        
        return slots;
    }

    async getCloudSyncStatus(): Promise<CloudSyncStatus> {
        return cloudSyncManager.getStatus();
    }

    setCloudSyncEnabled(enabled: boolean): void {
        cloudSyncManager.setEnabled(enabled);
    }

    async syncNow(): Promise<{ success: boolean; error?: string }> {
        return cloudSyncManager.syncNow();
    }

    async resolveConflict(id: string, resolution: 'keep-local' | 'keep-remote' | 'keep-both'): Promise<boolean> {
        const result = await cloudSyncManager.resolveConflict(id, resolution);
        if (result) {
            await this.notifySlotsChange();
        }
        return result;
    }

    async notifySlotsChange(): Promise<void> {
        if (this.onSlotsChange) {
            const slots = await this.getSlots();
            this.onSlotsChange(slots);
        }
    }

    async captureThumbnail(canvas: HTMLCanvasElement): Promise<string> {
        return canvas.toDataURL('image/jpeg', 0.6);
    }

    destroy(): void {
        cloudSyncManager.destroy();
    }
}

export const saveStateManager = new SaveStateManager();
