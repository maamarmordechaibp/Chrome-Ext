import { MessageRequest, MessageResponse } from '../types';
import { storageManager } from '../storage/StorageManager';

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse: (r: MessageResponse) => void) => {
    handleMessage(message).then(sendResponse).catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
);

async function handleMessage(message: MessageRequest): Promise<MessageResponse> {
  switch (message.type) {
    case 'FETCH_IMAGES_BATCH': {
      const { urls } = message.payload as { urls: string[] };
      const results = await Promise.allSettled(urls.map((url: string) => fetchImageBase64(url)));
      return { success: true, data: results.map((r) => r.status === 'fulfilled' ? r.value : null) };
    }
    case 'OPEN_ITEM': {
      const { catalogId, itemNumber } = message.payload as { catalogId: string; itemNumber: number };
      if (!catalogId) return { success: false, error: 'A Catalog ID is required.' };
      const mapping = await storageManager.findItem(catalogId, itemNumber);
      if (!mapping) return { success: false, error: `Item #${itemNumber} was not found in catalog ${catalogId}.` };
      await chrome.tabs.create({ url: mapping.url, active: true });
      return { success: true, data: mapping };
    }
    default: return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

async function fetchImageBase64(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'image/*' }, credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}