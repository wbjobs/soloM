import type { SaveStateInfo, SaveStateData, CloudSyncStatus, SyncConflict } from '../types';
import { saveStateDB } from './SaveStateDatabase';

export interface CloudStorageProvider {
    upload(save: SaveStateData): Promise<void>;
    download(id: string): Promise<SaveStateData | null>;
    list(): Promise<SaveStateInfo[]>;
    delete(id: string): Promise<void>;
    getLastSyncTimestamp(): Promise<number>;
}

export class MockCloudProvider implements CloudStorageProvider {
    storage: Map<string, SaveStateData> = new Map();
    lastSync = 0;

    async upload(save: SaveStateData): Promise<void> {
        this.storage.set(save.info.id, JSON.parse(JSON.stringify(save)));
        this.lastSync = Date.now();
        await this.delay(100);
    }

    async download(id: string): Promise<SaveStateData | null> {
        await this.delay(100);
        const data = this.storage.get(id);
        return data ? JSON.parse(JSON.stringify(data)) : null;
    }

    async list(): Promise<SaveStateInfo[]> {
        await this.delay(100);
        return Array.from(this.storage.values()).map(s => s.info);
    }

    async delete(id: string): Promise<void> {
        this.storage.delete(id);
        this.lastSync = Date.now();
        await this.delay(50);
    }

    async getLastSyncTimestamp(): Promise<number> {
        return this.lastSync;
    }

    delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export class CloudSyncManager {
    provider: CloudStorageProvider;
    syncEnabled = false;
    syncInterval: ReturnType<typeof setInterval> | null = null;
    isSyncing = false;
    lastError: string | null = null;
    onStatusChange: ((status: CloudSyncStatus) => void) | null = null;

    constructor(provider?: CloudStorageProvider) {
        this.provider = provider || new MockCloudProvider();
    }

    setProvider(provider: CloudStorageProvider): void {
        this.provider = provider;
    }

    setStatusCallback(callback: (status: CloudSyncStatus) => void): void {
        this.onStatusChange = callback;
    }

    setEnabled(enabled: boolean): void {
        this.syncEnabled = enabled;
        if (enabled && !this.syncInterval) {
            this.startAutoSync();
        } else if (!enabled && this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.notifyStatusChange();
    }

    isEnabled(): boolean {
        return this.syncEnabled;
    }

    async getStatus(): Promise<CloudSyncStatus> {
        const pending = await saveStateDB.getBySyncStatus('pending');
        const synced = await saveStateDB.getBySyncStatus('synced');
        const conflicts = await saveStateDB.getBySyncStatus('conflict');
        const all = await saveStateDB.list();

        return {
            enabled: this.syncEnabled,
            lastSync: await this.provider.getLastSyncTimestamp(),
            pendingCount: pending.length + conflicts.length,
            totalCount: all.length,
            isSyncing: this.isSyncing,
            error: this.lastError || undefined
        };
    }

    startAutoSync(): void {
        this.syncInterval = setInterval(() => {
            this.syncNow().catch(console.error);
        }, 30000);
    }

    async syncNow(): Promise<{ success: boolean; error?: string }> {
        if (!this.syncEnabled) {
            return { success: false, error: 'Cloud sync is disabled' };
        }

        if (this.isSyncing) {
            return { success: false, error: 'Sync already in progress' };
        }

        this.isSyncing = true;
        this.lastError = null;
        this.notifyStatusChange();

        try {
            await this.syncLocalToRemote();
            await this.syncRemoteToLocal();
            await this.resolveConflicts();
            
            const lastSync = Date.now();
            this.isSyncing = false;
            this.notifyStatusChange();
            
            return { success: true };
        } catch (e: any) {
            this.lastError = e.message || 'Sync failed';
            this.isSyncing = false;
            this.notifyStatusChange();
            
            return { success: false, error: this.lastError };
        }
    }

    async syncLocalToRemote(): Promise<void> {
        const pending = await saveStateDB.getBySyncStatus('pending');
        
        for (const info of pending) {
            try {
                const data = await saveStateDB.getData(info.id);
                if (data) {
                    await this.provider.upload(data);
                    await saveStateDB.updateInfo(info.id, {
                        syncStatus: 'synced',
                        syncTimestamp: Date.now()
                    });
                }
            } catch (e) {
                console.error(`Failed to upload save ${info.id}:`, e);
            }
        }

        const localDeletes = await saveStateDB.list();
        const remoteList = await this.provider.list();
        
        for (const remote of remoteList) {
            if (!localDeletes.find(s => s.id === remote.id)) {
                await this.provider.delete(remote.id);
            }
        }
    }

    async syncRemoteToLocal(): Promise<void> {
        const remoteList = await this.provider.list();
        const localList = await saveStateDB.list();
        
        for (const remote of remoteList) {
            const local = localList.find(s => s.id === remote.id);
            
            if (!local) {
                const data = await this.provider.download(remote.id);
                if (data) {
                    await saveStateDB.save(data);
                }
            } else if (remote.timestamp > (local.syncTimestamp || 0)) {
                if (local.syncStatus === 'synced' && local.timestamp < remote.timestamp) {
                    await this.markConflict(local, remote);
                }
            }
        }
    }

    async resolveConflicts(): Promise<void> {
        const conflicts = await saveStateDB.getBySyncStatus('conflict');
        
        for (const conflict of conflicts) {
            console.log('Conflict detected:', conflict.id);
        }
    }

    async markConflict(local: SaveStateInfo, remote: SaveStateInfo): Promise<void> {
        await saveStateDB.updateInfo(local.id, {
            syncStatus: 'conflict'
        });
    }

    async resolveConflict(id: string, resolution: 'keep-local' | 'keep-remote' | 'keep-both'): Promise<boolean> {
        const local = await saveStateDB.getInfo(id);
        if (!local) return false;

        try {
            const remote = await this.provider.download(id);

            if (resolution === 'keep-local') {
                const localData = await saveStateDB.getData(id);
                if (localData) {
                    localData.info.syncStatus = 'pending';
                    await saveStateDB.save(localData);
                    await this.provider.upload(localData);
                }
            } else if (resolution === 'keep-remote') {
                if (remote) {
                    await saveStateDB.save(remote);
                }
            } else if (resolution === 'keep-both') {
                if (remote) {
                    const newId = `${id}_remote_${Date.now()}`;
                    remote.info.id = newId;
                    remote.info.slot = -1;
                    remote.info.syncStatus = 'synced';
                    await saveStateDB.save(remote);
                    
                    const localData = await saveStateDB.getData(id);
                    if (localData) {
                        localData.info.syncStatus = 'pending';
                        await saveStateDB.save(localData);
                    }
                }
            }

            return true;
        } catch (e) {
            console.error('Failed to resolve conflict:', e);
            return false;
        }
    }

    notifyStatusChange(): void {
        if (this.onStatusChange) {
            this.getStatus().then(this.onStatusChange);
        }
    }

    destroy(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}

export const cloudSyncManager = new CloudSyncManager();
