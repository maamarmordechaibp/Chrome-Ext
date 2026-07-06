import { parserRegistry } from '../parsers/ParserRegistry';
import { MessageRequest, MessageResponse } from '../types';

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse: (r: MessageResponse) => void) => {
    handleContentMessage(message).then(sendResponse).catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
);

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
      if (!parser) return { success: false, error: 'Navigate to a search results page on Amazon, eBay, Walmart, or AliExpress.' };
      const start = (message.payload as { startItemNumber?: number } | undefined)?.startItemNumber ?? 1;
      const result = parser.extractFrom(document, start);
      return { success: result.success, data: result, error: result.error };
    }
    case 'EXTRACT_DETAIL': {
      if (!parser) return { success: false, error: 'Open a product page on Amazon, eBay, Walmart, or AliExpress.' };
      const detail = parser.extractDetail(document);
      if (!detail) return { success: false, error: 'Could not read this product page. Make sure it has finished loading.' };
      return { success: true, data: { success: true, detail } };
    }
    default: return { success: false, error: `Unknown message type: ${message.type}` };
  }
}