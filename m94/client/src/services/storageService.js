const DB_NAME = 'CRDTEditorDB';
const DB_VERSION = 1;
const SETTINGS_STORE = 'settings';

class StorageService {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }

  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('[IndexedDB] 打开数据库失败:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[IndexedDB] 数据库已打开');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          const store = db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
          store.createIndex('value', 'value', { unique: false });
        }
      };
    });
  }

  async waitForInit() {
    if (!this.db) {
      await this.initPromise;
    }
  }

  async getItem(key) {
    await this.waitForInit();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      const transaction = this.db.transaction(SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async setItem(key, value) {
    await this.waitForInit();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      const transaction = this.db.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.put({ key, value });

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async removeItem(key) {
    await this.waitForInit();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      const transaction = this.db.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async clear() {
    await this.waitForInit();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      const transaction = this.db.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async getAllKeys() {
    await this.waitForInit();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未初始化'));
        return;
      }

      const transaction = this.db.transaction(SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

export const storageService = new StorageService();

export const saveUserSettings = async (settings) => {
  try {
    await storageService.setItem('userSettings', settings);
    return true;
  } catch (error) {
    console.error('[Storage] 保存用户设置失败:', error);
    return false;
  }
};

export const loadUserSettings = async () => {
  try {
    const settings = await storageService.getItem('userSettings');
    return settings;
  } catch (error) {
    console.error('[Storage] 加载用户设置失败:', error);
    return null;
  }
};

export const saveRecentRooms = async (rooms) => {
  try {
    await storageService.setItem('recentRooms', rooms);
    return true;
  } catch (error) {
    console.error('[Storage] 保存最近房间失败:', error);
    return false;
  }
};

export const loadRecentRooms = async () => {
  try {
    const rooms = await storageService.getItem('recentRooms');
    return rooms || [];
  } catch (error) {
    console.error('[Storage] 加载最近房间失败:', error);
    return [];
  }
};

export default storageService;
