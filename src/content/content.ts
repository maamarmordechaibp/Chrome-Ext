import { parserRegistry } from '../parsers/ParserRegistry';
import { MessageRequest, MessageResponse } from '../types';

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse: (r: MessageResponse) => void) => {
    handleContentMessage(message).then(sendResponse).catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
);

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Scrolls the page top-to-bottom in steps so lazy-loaded product images and
 * links (Amazon, AliExpress, etc.) actually populate before we read the DOM,
 * then returns to the top. Bails out early once the bottom is reached.
 */
async function autoScrollToLoad(): Promise<void> {
  const step = Math.max(400, Math.floor(window.innerHeight * 0.85));
  const maxSteps = 30;
  let lastY = -1;
  for (let i = 0; i < maxSteps; i++) {
    window.scrollBy(0, step);
    await delay(220);
    const y = window.scrollY;
    const atBottom = window.innerHeight + y >= document.body.scrollHeight - 5;
    if (atBottom || y === lastY) break;
    lastY = y;
  }
  await delay(400); // let the last images settle
  window.scrollTo(0, 0);
  await delay(150);
}

async function handleContentMessage(message: MessageRequest): Promise<MessageResponse> {
  const url = window.location.href;
  const parser = parserRegistry.getParser(url);
  switch (message.type) {
    case 'GET_PAGE_INFO':
      if (!parser) return { success: true, data: { marketplace: 'Unknown', searchKeywords: '', currentPage: 1, isSupported: false, url, pageType: 'unsupported' } };
      return { success: true, data: { ...parser.extractPageInfo(document), pageType: parser.getPageType(document) } };
    case 'GET_NEXT_PAGE':
      if (!parser) return { success: false, error: 'Unsupported page.' };
      return { success: true, data: parser.getNextPage(document) };
    case 'EXTRACT_PRODUCTS': {
      if (!parser) return { success: false, error: 'Navigate to a search results page on a supported store (Amazon, Walmart, eBay, AliExpress, Target, Macy\'s, Costco, Home Depot, Best Buy, Lowe\'s, Wayfair, Etsy).' };
      const start = (message.payload as { startItemNumber?: number } | undefined)?.startItemNumber ?? 1;
      await autoScrollToLoad(); // trigger lazy-loaded images/links first
      const result = parser.extractFrom(document, start);
      return { success: result.success, data: result, error: result.error };
    }
    case 'EXTRACT_DETAIL': {
      if (!parser) return { success: false, error: 'Open a product page on a supported store (Amazon, Walmart, eBay, AliExpress, Target, Macy\'s, Costco, Home Depot, Best Buy, Lowe\'s, Wayfair, Etsy).' };
      const detail = parser.extractDetail(document);
      if (!detail) return { success: false, error: 'Could not read this product page. Make sure it has finished loading.' };
      return { success: true, data: { success: true, detail } };
    }
    default: return { success: false, error: `Unknown message type: ${message.type}` };
  }
}