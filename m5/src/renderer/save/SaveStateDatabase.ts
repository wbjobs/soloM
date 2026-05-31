import type { SaveStateInfo, SaveStateData } from '../types';

const DB_NAME = 'nes_save_states';
const DB_VERSION = 1;
const STORE_INFO = 'save_state_info';
const STORE_DATA = 'save_state_data';

export class SaveStateDatabase {
    db: IDBDatabase | null = null;

    async init(): Promise<void> {
        if (this.db) return;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                
                if (!db.objectStoreNames.contains(STORE_INFO)) {
                    const infoStore = db.createObjectStore(STORE_INFO, { keyPath: 'id' });
                    infoStore.createIndex('gameHash', 'gameHash', { unique: false });
                    infoStore.createIndex('timestamp', 'timestamp', { unique: false });
                    infoStore.createIndex('slot', ['gameHash', 'slot'], { unique: false });
                    infoStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }
                
                if (!db.objectStoreNames.contains(STORE_DATA)) {
                    db.createObjectStore(STORE_DATA, { keyPath: 'id' });
                }
            };
        });
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    async transaction<T>(
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
    ): Promise<T> {
        if (!this.db) throw new Error('Database not initialized');
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {};
            
            try {
                const result = callback(store);
                if (result instanceof IDBRequest) {
                    result.onsuccess = () => resolve(result.result);
                    result.onerror = () => reject(result.error);
                } else {
                    result.then(resolve).catch(reject);
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    async save(saveData: SaveStateData): Promise<void> {
        await this.init();
        
        const { info, state } = saveData;
        
        await this.transaction(STORE_INFO, 'readwrite', (store) => {
            return store.put(info);
        });
        
        await this.transaction(STORE_DATA, 'readwrite', (store) => {
            return store.put({ id: info.id, state });
        });
    }

    async getInfo(id: string): Promise<SaveStateInfo | null> {
        await this.init();
        return this.transaction(STORE_INFO, 'readonly', (store) => store.get(id));
    }

    async getData(id: string): Promise<SaveStateData | null> {
        await this.init();
        
        const info = await this.getInfo(id);
        if (!info) return null;
        
        const data = await this.transaction<any>(STORE_DATA, 'readonly', (store) => store.get(id));
        if (!data) return null;
        
        return { info, state: data.state };
    }

    async list(gameHash?: string): Promise<SaveStateInfo[]> {
        await this.init();
        
        const all = await this.transaction<SaveStateInfo[]>(STORE_INFO, 'readonly', (store) => store.getAll());
        
        if (gameHash) {
            return all.filter(s => s.gameHash === gameHash)
                     .sort((a, b) => b.timestamp - a.timestamp);
        }
        
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }

    async delete(id: string): Promise<void> {
        await this.init();
        
        await this.transaction(STORE_INFO, 'readwrite', (store) => store.delete(id));
        await this.transaction(STORE_DATA, 'readwrite', (store) => store.delete(id));
    }

    async updateInfo(id: string, updates: Partial<SaveStateInfo>): Promise<SaveStateInfo | null> {
        await this.init();
        
        const existing = await this.getInfo(id);
        if (!existing) return null;
        
        const updated = { ...existing, ...updates };
        await this.transaction(STORE_INFO, 'readwrite', (store) => store.put(updated));
        
        return updated;
    }

    async getBySlot(gameHash: string, slot: number): Promise<SaveStateInfo | null> {
        await this.init();
        
        const all = await this.list(gameHash);
        return all.find(s => s.slot === slot) || null;
    }

    async getBySyncStatus(status: SaveStateInfo['syncStatus']): Promise<SaveStateInfo[]> {
        await this.init();
        
        const all = await this.list();
        return all.filter(s => s.syncStatus === status);
    }

    async clearAll(): Promise<void> {
        await this.init();
        
        await this.transaction(STORE_INFO, 'readwrite', (store) => store.clear());
        await this.transaction(STORE_DATA, 'readwrite', (store) => store.clear());
    }
}

export const saveStateDB = new SaveStateDatabase();
