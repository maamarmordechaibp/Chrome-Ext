import { CatalogMeta, CatalogRecord, ItemMapping, Marketplace, Product, Settings } from '../types';
import { storageManager } from '../storage/StorageManager';
import { pdfGenerator } from '../pdf/PDFGenerator';
import { makeThumbnail, redactPeople } from './imageUtil';
import { fetchImagesBatched } from './fetchImages';
import { logUsage, reserveItems } from '../cloud/faxService';

export interface BuildCatalogInput {
  products: Product[];
  settings: Settings;
  marketplace: Marketplace;
  searchKeywords: string;
  pageCount: number;
  customerName?: string;
  representative?: string;
}

export interface BuiltCatalog {
  id: string;
  blob: Blob;
  record: CatalogRecord;
  products: Product[];
  meta: CatalogMeta;
}

/**
 * Reserves item numbers, fetches + optionally redacts images, renders the PDF
 * and persists the catalog (local + cloud). Shared by the popup's on-demand
 * generation and the background job so both produce identical catalogs.
 */
export async function buildCatalog(
  input: BuildCatalogInput,
  onProgress?: (pct: number, message: string) => void,
): Promise<BuiltCatalog> {
  const { settings } = input;
  const report = (pct: number, message: string) => onProgress?.(pct, message);

  report(5, 'Reserving item numbers…');
  const start = await reserveItems(input.products.length);
  const selected = input.products.map((p, i) => ({ ...p, itemNumber: start + i }));

  report(15, 'Fetching images…');
  const images = await fetchImagesBatched(selected.map((p) => p.imageUrl));
  const enriched = selected.map((p, i) => ({ ...p, imageBase64: images[i] ?? undefined }));

  if (settings.hidePeople) {
    report(30, 'Reviewing images…');
    const CONCURRENCY = 3;
    for (let i = 0; i < enriched.length; i += CONCURRENCY) {
      await Promise.all(
        enriched.slice(i, i + CONCURRENCY).map(async (p) => {
          if (p.imageBase64) p.imageBase64 = await redactPeople(p.imageBase64);
        }),
      );
    }
  }

  report(55, 'Generating PDF…');
  const id = await storageManager.nextCatalogId();
  const meta: CatalogMeta = {
    catalogId: id, marketplace: input.marketplace, searchKeywords: input.searchKeywords,
    timestamp: Date.now(), companyName: settings.companyName,
    companyLogo: settings.companyLogo, showLogo: settings.showLogo,
    customerName: input.customerName?.trim() || undefined,
    representative: input.representative?.trim() || undefined,
  };
  const blob = await pdfGenerator.generate(enriched, settings, meta);
  const thumb = await makeThumbnail(enriched.find((p) => p.imageBase64)?.imageBase64 ?? '');
  const maps: ItemMapping[] = enriched.map((p) => ({
    itemNumber: p.itemNumber, url: p.url, page: p.page, marketplace: p.marketplace,
    timestamp: p.timestamp, title: p.title, imageUrl: p.imageUrl,
  }));
  const record: CatalogRecord = {
    id, marketplace: input.marketplace, searchKeywords: input.searchKeywords,
    generationDate: Date.now(), productCount: enriched.length, pageCount: input.pageCount,
    customerName: meta.customerName, representative: meta.representative,
    thumbnail: thumb, favorite: false, hasPdf: true, itemMappings: maps,
  };
  await storageManager.saveCatalog(record);
  await storageManager.savePdf(id, blob);
  void logUsage('catalogs');

  report(100, `Catalog ${id} ready`);
  return { id, blob, record, products: enriched, meta };
}
