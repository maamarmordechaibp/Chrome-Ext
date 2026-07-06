import { CatalogRecord, ItemMapping, Settings } from '../types';
import { catalogDB } from './Database';

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

  getCatalogs(): Promise<CatalogRecord[]> { return catalogDB.getCatalogs(); }
  getCatalog(id: string): Promise<CatalogRecord | undefined> { return catalogDB.getCatalog(id); }
  saveCatalog(catalog: CatalogRecord): Promise<void> { return catalogDB.saveCatalog(catalog); }
  deleteCatalog(id: string): Promise<void> { return catalogDB.deleteCatalog(id); }

  async toggleFavorite(id: string): Promise<void> {
    const cat = await catalogDB.getCatalog(id);
    if (cat) { cat.favorite = !cat.favorite; await catalogDB.saveCatalog(cat); }
  }

  savePdf(catalogId: string, blob: Blob): Promise<void> { return catalogDB.putPdf(catalogId, blob); }
  getPdf(catalogId: string): Promise<Blob | undefined> { return catalogDB.getPdf(catalogId); }

  /** Looks up an item by its catalog ID and item number (unambiguous). */
  async findItem(catalogId: string, itemNumber: number): Promise<ItemMapping | null> {
    const cat = await catalogDB.getCatalog(catalogId.trim());
    if (!cat) return null;
    return cat.itemMappings.find((m) => m.itemNumber === itemNumber) ?? null;
  }

  async clearAll(): Promise<void> {
    await catalogDB.clear();
    return new Promise((resolve) => chrome.storage.local.remove([KEYS.CATALOG_SEQ], () => resolve()));
  }
}
export const storageManager = new StorageManager();