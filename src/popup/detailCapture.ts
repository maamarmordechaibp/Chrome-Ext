import { CatalogMeta, CatalogRecord, DetailResult, ItemMapping, ProductDetail, Settings } from '../types';
import { storageManager } from '../storage/StorageManager';
import { detailPdfGenerator } from '../pdf/DetailPDFGenerator';
import { makeThumbnail, redactPeople } from './imageUtil';

export interface DetailCaptureContext {
  customerName?: string; representative?: string;
}
export interface DetailCaptureResult { blob: Blob; catalogId: string; detail: ProductDetail; }
export type DetailProgress = (pct: number, message: string) => void;

function sendTab<T>(tabId: number, message: unknown): Promise<{ success: boolean; data?: T; error?: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(resp ?? { success: false, error: 'No response' });
    });
  });
}

function fetchImages(urls: string[]): Promise<(string | null)[]> {
  return new Promise((resolve, reject) => {
    if (!urls.length) { resolve([]); return; }
    chrome.runtime.sendMessage({ type: 'FETCH_IMAGES_BATCH', payload: { urls } }, (resp) => {
      if (chrome.runtime.lastError || !resp?.success) reject(new Error(resp?.error ?? 'Image fetch failed'));
      else resolve(resp.data as (string | null)[]);
    });
  });
}

/**
 * Captures the product on the active detail page: reads all fields + images,
 * optionally redacts people, renders the spec-sheet PDF and stores it.
 */
export async function captureDetail(
  tabId: number, settings: Settings, ctx: DetailCaptureContext, onProgress: DetailProgress,
): Promise<DetailCaptureResult> {
  onProgress(10, 'Reading product details…');
  const resp = await sendTab<DetailResult>(tabId, { type: 'EXTRACT_DETAIL' });
  if (!resp.success || !resp.data?.detail) throw new Error(resp.error ?? 'Could not read this product page.');
  const detail = resp.data.detail;

  onProgress(35, `Fetching ${detail.images.length} image(s)…`);
  const fetched = await fetchImages(detail.images);
  let imagesBase64 = fetched.map((f) => f ?? undefined);

  if (settings.hidePeople) {
    onProgress(60, 'Reviewing images…');
    imagesBase64 = await Promise.all(imagesBase64.map((img) => (img ? redactPeople(img) : Promise.resolve(undefined))));
  }
  detail.imagesBase64 = imagesBase64.filter((x): x is string => !!x);

  onProgress(80, 'Generating product sheet…');
  const id = await storageManager.nextCatalogId();
  const meta: CatalogMeta = {
    catalogId: id, marketplace: detail.marketplace, searchKeywords: detail.title,
    timestamp: Date.now(), companyName: settings.companyName,
    companyLogo: settings.companyLogo, showLogo: settings.showLogo,
    customerName: ctx.customerName?.trim() || undefined, representative: ctx.representative?.trim() || undefined,
  };
  const blob = await detailPdfGenerator.generate(detail, settings, meta);

  const thumb = await makeThumbnail(detail.imagesBase64[0] ?? '');
  const startNo = settings.startItemNumber ?? 1001;
  const maps: ItemMapping[] = [{
    itemNumber: startNo, url: detail.url, page: 1, marketplace: detail.marketplace,
    timestamp: detail.timestamp, title: detail.title, imageUrl: detail.images[0],
  }];
  const rec: CatalogRecord = {
    id, marketplace: detail.marketplace, searchKeywords: detail.title.substring(0, 60),
    generationDate: Date.now(), productCount: 1, pageCount: 1,
    customerName: meta.customerName, representative: meta.representative,
    thumbnail: thumb, favorite: false, hasPdf: true, itemMappings: maps,
  };
  await storageManager.saveCatalog(rec);
  await storageManager.savePdf(id, blob);

  onProgress(100, `Product sheet ${id} ready`);
  return { blob, catalogId: id, detail };
}
