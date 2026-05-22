/**
 * indexedDb.ts
 *
 * Lightweight, SSR-safe client store using native browser IndexedDB
 * to persist binary File objects. Allows resumable uploads to survive
 * page refreshes and mobile browser memory reclamation.
 */

class IndexedDbStore {
  private dbName = "smartprint-upload-store";
  private storeName = "files";
  private dbPromise: Promise<IDBDatabase> | null = null;

  private initDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB is not supported in this environment"));
        return;
      }

      try {
        const request = window.indexedDB.open(this.dbName, 1);

        request.onerror = () => {
          console.error("[IndexedDB] Open database request failed:", request.error);
          this.dbPromise = null;
          reject(request.error || new Error("Failed to open IndexedDB"));
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
      } catch (err) {
        console.error("[IndexedDB] Exception in initDb:", err);
        this.dbPromise = null;
        reject(err);
      }
    });

    return this.dbPromise;
  }

  /** Save a binary File object under a unique key (file ID). */
  async saveFile(id: string, file: File): Promise<void> {
    try {
      const db = await this.initDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.put(file, id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error(`[IndexedDB] Transaction error saving file ${id}:`, transaction.error);
          reject(transaction.error || new Error("Save transaction failed"));
        };
        request.onerror = () => reject(request.error || new Error("Put request failed"));
      });
    } catch (err) {
      console.warn(`[IndexedDB] Failed to save file ${id}:`, err);
    }
  }

  /** Retrieve a binary File object from the store by its ID. */
  async getFile(id: string): Promise<File | null> {
    try {
      const db = await this.initDb();
      return new Promise<File | null>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve((request.result as File) || null);
        };
        request.onerror = () => {
          console.error(`[IndexedDB] Error reading file ${id}:`, request.error);
          reject(request.error || new Error("Get request failed"));
        };
      });
    } catch (err) {
      console.warn(`[IndexedDB] Failed to get file ${id}:`, err);
      return null;
    }
  }

  /** Delete a file entry by ID. */
  async deleteFile(id: string): Promise<void> {
    try {
      const db = await this.initDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error(`[IndexedDB] Transaction error deleting file ${id}:`, transaction.error);
          reject(transaction.error || new Error("Delete transaction failed"));
        };
        request.onerror = () => reject(request.error || new Error("Delete request failed"));
      });
    } catch (err) {
      console.warn(`[IndexedDB] Failed to delete file ${id}:`, err);
    }
  }

  /** Wipe the database entries clean. */
  async clear(): Promise<void> {
    try {
      const db = await this.initDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error("[IndexedDB] Transaction error clearing database:", transaction.error);
          reject(transaction.error || new Error("Clear transaction failed"));
        };
        request.onerror = () => reject(request.error || new Error("Clear request failed"));
      });
    } catch (err) {
      console.warn("[IndexedDB] Failed to clear IndexedDB:", err);
    }
  }
}

export const indexedDbStore = new IndexedDbStore();
