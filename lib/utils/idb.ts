import { CollageHistoryItem } from "@/hooks/useCollageCapture";

const DB_NAME = "CollageAppDB";
const STORE_NAME = "history";
const KEY_NAME = "collage_history_v10";

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHistoryToDB(history: CollageHistoryItem[]): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(history, KEY_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("Failed to save history to IndexedDB", e);
  }
}

export async function loadHistoryFromDB(): Promise<CollageHistoryItem[]> {
  if (typeof window === "undefined" || !window.indexedDB) return [];
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY_NAME);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn("Failed to load history from IndexedDB", e);
    return [];
  }
}
