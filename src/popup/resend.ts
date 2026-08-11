// Resolves the PDF for a catalog so it can be re-faxed/emailed. Uses the locally
// stored PDF when available; otherwise regenerates it from the shared catalog
// record (re-fetching product images) so any rep can resend a catalog created
// on another computer.
import { CatalogMeta, Product } from '../types';
import { storageManager } from '../storage/StorageManager';
import { pdfGenerator } from '../pdf/PDFGenerator';
import { fetchImagesBatched } from './fetchImages';

function fetchImages(urls: string[]): Promise<(string | null)[]> {
  return fetchImagesBatched(urls);
}

/** Returns a PDF Blob for the catalog, regenerating it if not stored locally. */
export async function getCatalogPdfBlob(catalogId: string): Promise<Blob> {
  const id = catalogId.trim();

  const local = await storageManager.getPdf(id);
  if (local) return local;

  const cat = await storageManager.getCatalog(id);
  if (!cat) throw new Error(`Catalog ${id} not found.`);

  const settings = await storageManager.getSettings();
  const products: Product[] = cat.itemMappings.map((m) => ({
    id: String(m.itemNumber), itemNumber: m.itemNumber, marketplace: m.marketplace,
    title: m.title, imageUrl: m.imageUrl ?? '', price: '',
    page: m.page, url: m.url, searchKeywords: cat.searchKeywords, timestamp: m.timestamp,
  }));

  const images = await fetchImages(products.map((p) => p.imageUrl));
  const enriched = products.map((p, i) => ({ ...p, imageBase64: images[i] ?? undefined }));

  const meta: CatalogMeta = {
    catalogId: id, marketplace: cat.marketplace, searchKeywords: cat.searchKeywords,
    timestamp: cat.generationDate, companyName: settings.companyName,
    companyLogo: settings.companyLogo, showLogo: settings.showLogo,
    customerName: cat.customerName, representative: cat.representative,
  };

  const blob = await pdfGenerator.generate(enriched, settings, meta);
  try { await storageManager.savePdf(id, blob); } catch { /* cache best-effort */ }
  return blob;
}
