import { MessageRequest, MessageResponse } from '../types';
import { storageManager } from '../storage/StorageManager';
import { processJobQueue } from './jobRunner';

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse: (r: MessageResponse) => void) => {
    // Messages addressed to the offscreen document are handled there, not here.
    if ((message as { target?: string }).target === 'offscreen') return false;
    handleMessage(message).then(sendResponse).catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
);

async function handleMessage(message: MessageRequest): Promise<MessageResponse> {
  switch (message.type) {
    case 'RUN_JOBS': {
      void processJobQueue();
      return { success: true };
    }
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

// Resume any interrupted jobs when the worker (re)starts, and poll periodically
// so a job survives the service worker being suspended mid-run.
chrome.runtime.onStartup.addListener(() => { void processJobQueue(); });
chrome.runtime.onInstalled.addListener(() => { void processJobQueue(); });
chrome.alarms.create('job-tick', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'job-tick') void processJobQueue();
});