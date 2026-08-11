// Fetches product images (as base64 data URLs) through the background worker in
// small batches. A single runtime message that carries every image at once can
// grow to several megabytes on large catalogs, which Chrome's messaging drops
// silently — the response comes back empty and the caller sees a spurious
// "Image fetch failed". Chunking keeps every message comfortably small.
const BATCH_SIZE = 12;

function sendBatch(urls: string[]): Promise<(string | null)[]> {
  return new Promise((resolve, reject) => {
    if (!urls.length) { resolve([]); return; }
    chrome.runtime.sendMessage({ type: 'FETCH_IMAGES_BATCH', payload: { urls } }, (resp) => {
      if (chrome.runtime.lastError || !resp?.success) {
        reject(new Error(resp?.error ?? chrome.runtime.lastError?.message ?? 'Image fetch failed'));
      } else {
        resolve(resp.data as (string | null)[]);
      }
    });
  });
}

/** Resolves base64 data URLs for every input URL, preserving order. Entries that
 *  fail to load resolve to null so the PDF can still render a placeholder. */
export async function fetchImagesBatched(urls: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const part = await sendBatch(urls.slice(i, i + BATCH_SIZE));
    out.push(...part);
  }
  return out;
}
