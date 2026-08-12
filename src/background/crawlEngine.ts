import { CrawlOptions, Marketplace, Product } from '../types';
import { buildSearchUrl } from '../parsers/searchUrl';
import { crawl, CrawlProgress, CrawlResult, crawlDelay, waitForTabComplete } from '../popup/crawler';

/** Extra settle time after a freshly created window's tab reports complete,
 *  before the first extraction (heavy marketplaces hydrate late). */
const INITIAL_SETTLE_MS = 4000;
/** Additional wait before a second extraction attempt for late-hydrating SPAs. */
const RETRY_SETTLE_MS = 4000;

/**
 * Crawls a results URL in a detached, unfocused window so scanning runs in the
 * background without the popup open. The window is intentionally NOT minimized:
 * Chrome suspends rendering and timers in minimized windows, so JS-heavy
 * marketplace pages never hydrate their product list. Reuses the same
 * tab-driven crawl loop the popup uses. The window is always closed afterwards.
 */
export async function crawlUrlInBackground(
  url: string,
  options: CrawlOptions,
  onProgress: (p: CrawlProgress) => void,
): Promise<CrawlResult> {
  const win = await chrome.windows.create({ url, focused: false, width: 1000, height: 820, left: 0, top: 0 });
  const tabId = win.tabs?.[0]?.id;
  if (win.id === undefined || tabId === undefined) {
    if (win.id !== undefined) { try { await chrome.windows.remove(win.id); } catch { /* ignore */ } }
    throw new Error('Could not open a background window to scan.');
  }
  try {
    await waitForTabComplete(tabId);
    await crawlDelay(INITIAL_SETTLE_MS);
    try {
      return await crawl(tabId, options, onProgress);
    } catch {
      // Late-hydrating single-page app: wait longer and try once more.
      await crawlDelay(RETRY_SETTLE_MS);
      return await crawl(tabId, options, onProgress);
    }
  } finally {
    try { await chrome.windows.remove(win.id); } catch { /* window may already be closed */ }
  }
}

/** Products from one marketplace, tagged with where they came from. */
export interface MarketplaceScan { marketplace: Marketplace; products: Product[]; }

/** Outcome of a multi-site search: successful scans plus per-site skip reasons. */
export interface MarketplaceScanResult {
  scans: MarketplaceScan[];
  skipped: { marketplace: Marketplace; reason: string }[];
}

/**
 * Runs the same keyword search across several marketplaces sequentially,
 * building each search URL and crawling it in the background. Marketplaces whose
 * search endpoint is unknown, or that yield no products, are recorded in
 * {@link MarketplaceScanResult.skipped} with a reason.
 */
export async function crawlMarketplaces(
  marketplaces: Marketplace[],
  keywords: string,
  options: CrawlOptions,
  onProgress: (p: { marketplace: Marketplace; message: string; found: number }) => void,
): Promise<MarketplaceScanResult> {
  const scans: MarketplaceScan[] = [];
  const skipped: { marketplace: Marketplace; reason: string }[] = [];
  for (const marketplace of marketplaces) {
    const url = buildSearchUrl(marketplace, keywords);
    if (!url) { skipped.push({ marketplace, reason: 'no search URL' }); continue; }
    onProgress({ marketplace, message: `Searching ${marketplace}…`, found: 0 });
    try {
      const result = await crawlUrlInBackground(url, options, (p) =>
        onProgress({ marketplace, message: `${marketplace}: ${p.message}`, found: p.found }),
      );
      if (result.products.length > 0) scans.push({ marketplace, products: result.products });
      else skipped.push({ marketplace, reason: 'no products found' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'error';
      skipped.push({ marketplace, reason });
      onProgress({ marketplace, message: `${marketplace} skipped: ${reason}`, found: 0 });
    }
  }
  return { scans, skipped };
}

