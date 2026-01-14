/**
 * IndexedDB永続キャッシュ
 * - ページリロード後もキャッシュを保持
 * - TTL（24時間）で自動期限切れ
 * - 日付変更時に古いキャッシュをクリア
 */

const DB_NAME = 'racescore-cache';
const DB_VERSION = 2; // v2: 過去走データ5件→50件対応
const STORE_NAME = 'race-cards';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24時間

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  date: string; // レースの日付（キャッシュクリア用）
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * IndexedDBを開く（シングルトン）
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    // サーバーサイドでは使用不可
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[IndexedDB] Database opened successfully');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      
      console.log(`[IndexedDB] Upgrading from v${oldVersion} to v${DB_VERSION}`);
      
      // v1→v2: 過去走データ構造変更のためキャッシュクリア
      if (oldVersion > 0 && oldVersion < 2) {
        // 古いストアを削除して再作成
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
          console.log('[IndexedDB] Old cache cleared due to version upgrade');
        }
      }
      
      // オブジェクトストアを作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[IndexedDB] Object store created');
      }
    };
  });

  return dbPromise;
}

/**
 * キャッシュからデータを取得
 */
export async function getFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        
        if (!entry) {
          resolve(null);
          return;
        }

        // TTL超過チェック
        if (Date.now() - entry.timestamp > CACHE_TTL) {
          console.log(`[IndexedDB] Cache expired: ${key}`);
          // 期限切れエントリを削除（非同期）
          deleteFromIndexedDB(key).catch(() => {});
          resolve(null);
          return;
        }

        console.log(`[IndexedDB] Cache hit: ${key}`);
        resolve(entry.data as T);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Get error:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] Get failed:', error);
    return null;
  }
}

/**
 * キャッシュにデータを保存
 */
export async function setToIndexedDB(key: string, data: any, date: string): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const entry: CacheEntry = {
        key,
        data,
        timestamp: Date.now(),
        date
      };

      const request = store.put(entry);

      request.onsuccess = () => {
        console.log(`[IndexedDB] Cache set: ${key}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[IndexedDB] Set error:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[IndexedDB] Set failed:', error);
  }
}

/**
 * 特定のキーを削除
 */
export async function deleteFromIndexedDB(key: string): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Delete failed:', error);
  }
}

/**
 * 特定の日付のキャッシュをすべてクリア
 */
export async function clearCacheByDate(targetDate: string): Promise<number> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('date');
      const request = index.openCursor(IDBKeyRange.only(targetDate));
      
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`[IndexedDB] Cleared ${deletedCount} entries for date: ${targetDate}`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Clear by date failed:', error);
    return 0;
  }
}

/**
 * 古いキャッシュをすべてクリア（TTL超過）
 */
export async function clearExpiredCache(): Promise<number> {
  try {
    const db = await openDB();
    const expireTime = Date.now() - CACHE_TTL;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(IDBKeyRange.upperBound(expireTime));
      
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`[IndexedDB] Cleared ${deletedCount} expired entries`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Clear expired failed:', error);
    return 0;
  }
}

/**
 * 全キャッシュをクリア
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[IndexedDB] All cache cleared');
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Clear all failed:', error);
  }
}

/**
 * キャッシュの件数を取得
 */
export async function getCacheCount(): Promise<number> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Count failed:', error);
    return 0;
  }
}

/**
 * IndexedDBが利用可能かチェック
 */
export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.indexedDB;
}

