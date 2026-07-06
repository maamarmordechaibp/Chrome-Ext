import { CatalogRecord } from '../types';

/**
 * Thin promise-based IndexedDB wrapper for catalog data.
 *
 * IndexedDB is used for the heavy, high-volume data (catalogs with hundreds or
 * thousands of products, cached product images and generated PDFs). Lightweight
 * settings/preferences stay in `chrome.storage.local` (see StorageManager).
 *
 * The extension popup and background service worker share the same origin
 * (chrome-extension://<id>), so this database is shared between them.
 */
const DB_NAME = 'catalog-db';
const DB_VERSION = 1;
const STORE_CATALOGS = 'catalogs';
const STORE_IMAGES = 'images';
const STORE_PDFS = 'pdfs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CATALOGS)) {
        const store = db.createObjectStore(STORE_CATALOGS, { keyPath: 'id' });
        store.createIndex('generationDate', 'generationDate');
        store.createIndex('favorite', 'favorite');
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES);
      if (!db.objectStoreNames.contains(STORE_PDFS)) db.createObjectStore(STORE_PDFS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const catalogDB = {
  async getCatalogs(): Promise<CatalogRecord[]> {
    const all = await tx<CatalogRecord[]>(STORE_CATALOGS, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => {
      if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
      return b.generationDate - a.generationDate;
    });
  },
  getCatalog(id: string): Promise<CatalogRecord | undefined> {
    return tx<CatalogRecord | undefined>(STORE_CATALOGS, 'readonly', (s) => s.get(id));
  },
  async saveCatalog(record: CatalogRecord): Promise<void> {
    await tx(STORE_CATALOGS, 'readwrite', (s) => s.put(record));
  },
  async deleteCatalog(id: string): Promise<void> {
    await tx(STORE_CATALOGS, 'readwrite', (s) => s.delete(id));
    await tx(STORE_PDFS, 'readwrite', (s) => s.delete(id));
  },
  getImage(url: string): Promise<string | undefined> {
    return tx<string | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(url));
  },
  async putImage(url: string, base64: string): Promise<void> {
    await tx(STORE_IMAGES, 'readwrite', (s) => s.put(base64, url));
  },
  getPdf(id: string): Promise<Blob | undefined> {
    return tx<Blob | undefined>(STORE_PDFS, 'readonly', (s) => s.get(id));
  },
  /** True if a PDF blob for this catalog exists locally (no blob is loaded). */
  async hasPdf(id: string): Promise<boolean> {
    const key = await tx<IDBValidKey | undefined>(STORE_PDFS, 'readonly', (s) => s.getKey(id));
    return key !== undefined;
  },
  async putPdf(id: string, blob: Blob): Promise<void> {
    await tx(STORE_PDFS, 'readwrite', (s) => s.put(blob, id));
  },
  async clear(): Promise<void> {
    await tx(STORE_CATALOGS, 'readwrite', (s) => s.clear());
    await tx(STORE_IMAGES, 'readwrite', (s) => s.clear());
    await tx(STORE_PDFS, 'readwrite', (s) => s.clear());
  },
};
