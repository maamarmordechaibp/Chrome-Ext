import { CatalogRecord, ItemMapping, Settings } from '../types';
import { catalogDB } from './Database';

/** Lazily loads the cloud layer only when needed. Keeps Firebase out of the
 *  background service worker bundle (which never calls cloud methods). */
async function cloud() {
  const { cloudCatalog } = await import('../cloud/cloudCatalog');
  return cloudCatalog;
}

const DEFAULT_SETTINGS: Settings = {
  productsPerRow: 2, rowsPerPage: 3,
  showRatings: true, showReviews: true, showDiscounts: true,
  showShipping: true, showSeller: false, showQRCode: false, showProductURL: false,
  showBrand: true, showDescription: true,
  hidePeople: true,
  companyName: 'CodeLab',
  companyLogo: undefined, showLogo: true,
  defaultCustomerName: '', defaultRepresentative: '',
  crawlMode: 'current', maxPages: 5,
};

const KEYS = { SETTINGS: 'settings', CATALOG_SEQ: 'catalogSeq' } as const;

/** Settings and small preferences live in chrome.storage.local; heavy catalog
 *  data (catalogs, images, PDFs) lives in IndexedDB via {@link catalogDB}. */
class StorageManager {
  async getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEYS.SETTINGS, (data) => resolve({ ...DEFAULT_SETTINGS, ...(data[KEYS.SETTINGS] ?? {}) }));
    });
  }
  async saveSettings(s: Settings): Promise<void> {
    return new Promise((resolve) => { chrome.storage.local.set({ [KEYS.SETTINGS]: s }, resolve); });
  }

  /** Generates the next human-readable catalog ID: CAT-YYYYMMDD-NNNNNN. */
  async nextCatalogId(): Promise<string> {
    const seq = await new Promise<number>((resolve) => {
      chrome.storage.local.get(KEYS.CATALOG_SEQ, (d) => resolve((d[KEYS.CATALOG_SEQ] as number) ?? 0));
    });
    const next = seq + 1;
    await new Promise<void>((resolve) => chrome.storage.local.set({ [KEYS.CATALOG_SEQ]: next }, () => resolve()));
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `CAT-${ymd}-${String(next).padStart(6, '0')}`;
  }

  /** Returns team catalogs (from the cloud) merged with any local-only ones.
   *  Falls back to local when signed out or offline. */
  async getCatalogs(): Promise<CatalogRecord[]> {
    const local = await catalogDB.getCatalogs();
    try {
      const cloudList = await (await cloud()).list();
      if (cloudList.length === 0) return local;
      // Cloud is the shared source of truth; keep local-only extras too.
      const byId = new Map<string, CatalogRecord>();
      for (const c of local) byId.set(c.id, c);
      for (const c of cloudList) byId.set(c.id, c); // cloud wins on conflicts
      return [...byId.values()].sort((a, b) => {
        if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
        return b.generationDate - a.generationDate;
      });
    } catch {
      return local; // offline / not signed in
    }
  }

  /** Looks up a single catalog, preferring the shared cloud copy so any rep can
   *  open a catalog created on another computer. */
  async getCatalog(id: string): Promise<CatalogRecord | undefined> {
    try {
      const remote = await (await cloud()).get(id.trim());
      if (remote) return remote;
    } catch { /* fall through to local */ }
    return catalogDB.getCatalog(id);
  }

  /** Saves locally (fast cache) and to the team cloud (shared). Cloud failures
   *  are non-fatal so the app keeps working offline. */
  async saveCatalog(catalog: CatalogRecord): Promise<void> {
    await catalogDB.saveCatalog(catalog);
    try { await (await cloud()).save(catalog); } catch (e) { console.warn('Cloud save failed:', e); }
  }

  async deleteCatalog(id: string): Promise<void> {
    await catalogDB.deleteCatalog(id);
    try { await (await cloud()).remove(id); } catch (e) { console.warn('Cloud delete failed:', e); }
  }

  async toggleFavorite(id: string): Promise<void> {
    const cat = (await this.getCatalog(id));
    if (cat) { cat.favorite = !cat.favorite; await this.saveCatalog(cat); }
  }

  savePdf(catalogId: string, blob: Blob): Promise<void> { return catalogDB.putPdf(catalogId, blob); }
  getPdf(catalogId: string): Promise<Blob | undefined> { return catalogDB.getPdf(catalogId); }

  /** Looks up an item by its catalog ID and item number (unambiguous).
   *  Checks the shared cloud catalog first so any rep can resolve an item
   *  created on another computer, falling back to the local cache. */
  async findItem(catalogId: string, itemNumber: number): Promise<ItemMapping | null> {
    const id = catalogId.trim();
    const cat = (await this.getCatalog(id)) ?? (await catalogDB.getCatalog(id));
    if (!cat) return null;
    return cat.itemMappings.find((m) => m.itemNumber === itemNumber) ?? null;
  }

  async clearAll(): Promise<void> {
    await catalogDB.clear();
    return new Promise((resolve) => chrome.storage.local.remove([KEYS.CATALOG_SEQ], () => resolve()));
  }
}
export const storageManager = new StorageManager();