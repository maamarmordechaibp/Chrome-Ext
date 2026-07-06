import { CrawlOptions, ExtractResult, MessageResponse, NextPageInfo, PageInfo, Product } from '../types';

export interface CrawlProgress { page: number; totalPages: number; found: number; message: string; }
export interface CrawlResult { products: Product[]; pageInfo: PageInfo; pagesScanned: number; }

const PAGE_SETTLE_MS = 1800;
const MAX_EXTRACT_RETRIES = 3;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function sendTabMessage<T>(tabId: number, message: unknown): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp: MessageResponse<T>) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(resp ?? { success: false, error: 'No response' });
    });
  });
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Safety timeout in case the 'complete' event is missed.
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 20000);
  });
}

/** Extracts one page, retrying while the content script/DOM settles. */
async function extractPage(tabId: number, startItemNumber: number): Promise<ExtractResult | null> {
  for (let attempt = 0; attempt < MAX_EXTRACT_RETRIES; attempt++) {
    const resp = await sendTabMessage<ExtractResult>(tabId, { type: 'EXTRACT_PRODUCTS', payload: { startItemNumber } });
    if (resp.success && resp.data && resp.data.products.length > 0) return resp.data;
    await delay(700);
  }
  return null;
}

/**
 * Scans the current results page and, depending on {@link CrawlOptions.mode},
 * automatically navigates the tab through subsequent pages, accumulating
 * products with continuous item numbering.
 */
export async function crawl(
  tabId: number,
  options: CrawlOptions,
  onProgress: (p: CrawlProgress) => void,
): Promise<CrawlResult> {
  const targetPages = options.mode === 'current' ? 1 : Math.max(1, options.maxPages);
  const products: Product[] = [];
  let start = 1;
  let pagesScanned = 0;

  onProgress({ page: 1, totalPages: targetPages, found: 0, message: 'Scanning page 1…' });
  const first = await extractPage(tabId, start);
  if (!first) {
    const info = await sendTabMessage<ExtractResult>(tabId, { type: 'EXTRACT_PRODUCTS', payload: { startItemNumber: 1 } });
    throw new Error(info.error ?? 'No products found on this page.');
  }
  const firstPageInfo = first.pageInfo;
  products.push(...first.products);
  start += first.products.length;
  pagesScanned = 1;
  onProgress({ page: 1, totalPages: targetPages, found: products.length, message: `Page 1 · ${products.length} products` });

  while (pagesScanned < targetPages) {
    const nextResp = await sendTabMessage<NextPageInfo>(tabId, { type: 'GET_NEXT_PAGE' });
    const nextUrl = nextResp.success ? nextResp.data?.url : null;
    if (!nextUrl) break;

    const pageNo = pagesScanned + 1;
    onProgress({ page: pageNo, totalPages: targetPages, found: products.length, message: `Loading page ${pageNo}…` });
    await chrome.tabs.update(tabId, { url: nextUrl });
    await waitForTabComplete(tabId);
    await delay(PAGE_SETTLE_MS);

    const result = await extractPage(tabId, start);
    if (!result || result.products.length === 0) break;
    products.push(...result.products);
    start += result.products.length;
    pagesScanned = pageNo;
    onProgress({ page: pageNo, totalPages: targetPages, found: products.length, message: `Page ${pageNo} · ${products.length} products` });
  }

  return { products, pageInfo: { ...firstPageInfo, totalPages: firstPageInfo.totalPages ?? pagesScanned }, pagesScanned };
}
