import { TabInfo } from '@/store/tabSlice';

const DB_NAME = 'tabflow';
const DB_VERSION = 1;
const TABS_STORE = 'closedTabs';
const META_STORE = 'metadata';

export interface MetaData {
  lastSyncTime: number;
  wasManuallyCleared: boolean;
  lastSessionId?: string;
  lastBrowserClose?: number;
}

export class StorageService {
  private db: IDBDatabase | null = null;
  private currentSessionId: string = crypto.randomUUID();

  async initialize(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.updateSessionData();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create tabs store with sessionId as index
        if (!db.objectStoreNames.contains(TABS_STORE)) {
          const tabStore = db.createObjectStore(TABS_STORE, { keyPath: 'id' });
          try {
            tabStore.createIndex('sessionId', 'sessionId', { unique: false });
          } catch (error) {
            console.error('Error creating sessionId index:', error);
          }
          try {
            tabStore.createIndex('closedAt', 'closedAt');
          } catch (error) {
            console.error('Error creating closedAt index:', error);
          }
        }

        // Create meta store for sync data
        if (!db.objectStoreNames.contains(META_STORE)) {
          try {
            db.createObjectStore(META_STORE, { keyPath: 'key' });
          } catch (error) {
            console.error('Error creating meta store:', error);
          }
        }
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  private async updateSessionData(): Promise<void> {
    const metadata = await this.getMetaData();
    const now = Date.now();
    
    await this.updateMetaData({
      ...metadata,
      lastSessionId: this.currentSessionId,
      lastBrowserClose: now
    });
  }

  async isNewBrowserSession(): Promise<boolean> {
    const metadata = await this.getMetaData();
    return !metadata.lastSessionId || metadata.lastSessionId !== this.currentSessionId;
  }

  async addTab(tab: TabInfo): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(TABS_STORE, 'readwrite');
        const request = store.add(tab);
        
        request.onerror = () => {
          console.error(`Failed to add tab ${tab.id} to storage:`, request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          console.log(`Tab ${tab.id} successfully stored:`, tab.title);
          resolve();
        };
      } catch (error) {
        console.error('Error accessing storage:', error);
        reject(error);
      }
    });
  }

  async removeTab(id: number): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(TABS_STORE, 'readwrite');
        const request = store.delete(id);
        
        request.onerror = () => {
          console.error(`Failed to remove tab ${id} from storage:`, request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          console.log(`Tab ${id} successfully removed from storage`);
          resolve();
        };
      } catch (error) {
        console.error('Error accessing storage:', error);
        reject(error);
      }
    });
  }

  async getAllTabs(): Promise<TabInfo[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(TABS_STORE);
        const request = store.index('closedAt').getAll();
        
        request.onerror = () => {
          console.error('Failed to get tabs from storage:', request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          // Sort by closedAt in descending order
          const tabs = request.result as TabInfo[];
          const sortedTabs = tabs.sort((a, b) => b.closedAt - a.closedAt);
          console.log(`Retrieved ${sortedTabs.length} tabs from storage`);
          resolve(sortedTabs);
        };
      } catch (error) {
        console.error('Error accessing storage:', error);
        reject(error);
      }
    });
  }

  async clearAllTabs(): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(TABS_STORE, 'readwrite');
        const request = store.clear();
        
        request.onerror = () => {
          console.error('Failed to clear tabs from storage:', request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          console.log('All tabs cleared from storage');
          resolve();
        };
      } catch (error) {
        console.error('Error accessing storage:', error);
        reject(error);
      }
    });
  }

  async updateMetaData(data: Partial<MetaData>): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(META_STORE, 'readwrite');
      Object.entries(data).forEach(([key, value]) => {
        const request = store.put({ key, value });
        request.onerror = () => reject(request.error);
      });
      resolve();
    });
  }

  async getMetaData(): Promise<MetaData> {
    await this.initialize();
    const defaultMeta: MetaData = {
      lastSyncTime: 0,
      wasManuallyCleared: false
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore(META_STORE);
      const result: Partial<MetaData> = {};
      
      const getAllKeys = store.getAllKeys();
      getAllKeys.onerror = () => reject(getAllKeys.error);
      getAllKeys.onsuccess = () => {
        const keys = getAllKeys.result;
        let completed = 0;

        if (keys.length === 0) {
          resolve(defaultMeta);
          return;
        }

        keys.forEach(key => {
          const request = store.get(key);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            if (request.result) {
              result[request.result.key as keyof MetaData] = request.result.value;
            }
            completed++;
            if (completed === keys.length) {
              resolve({ ...defaultMeta, ...result });
            }
          };
        });
      };
    });
  }

  async hasTab(sessionId: string): Promise<boolean> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(TABS_STORE);
      const request = store.index('sessionId').count(sessionId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result > 0);
    });
  }

  async cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.initialize();
    const cutoff = Date.now() - maxAge;
    
    return new Promise((resolve, reject) => {
      const store = this.getStore(TABS_STORE, 'readwrite');
      const index = store.index('closedAt');
      const range = IDBKeyRange.upperBound(cutoff);
      
      const request = index.openCursor(range);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}

export const storage = new StorageService();
