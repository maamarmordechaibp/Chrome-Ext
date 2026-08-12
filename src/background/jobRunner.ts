// Service-worker job orchestrator. Crawls target marketplaces in background
// windows, matches similar items, then hands the final product list to the
// offscreen document to render and send the catalog. Never touches Firebase or
// the DOM itself (those live in the offscreen document).
import { BackgroundJob, Marketplace, Product, Settings } from '../types';
import { storageManager } from '../storage/StorageManager';
import { crawlMarketplaces, MarketplaceScan } from './crawlEngine';
import { rankSimilar } from '../parsers/similarity';

/** Hard cap so a runaway multi-site search can't produce an enormous catalog. */
const MAX_ITEMS = 60;
const OFFSCREEN_URL = 'offscreen.html';

function dedup(products: Product[]): Product[] {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const p of products) {
    const key = p.url || p.id;
    if (seen.has(key)) continue;
    seen.add(key); out.push(p);
  }
  return out;
}

function primaryMarketplace(scans: MarketplaceScan[]): Marketplace {
  return scans[0]?.marketplace ?? 'Unknown';
}

async function hasOffscreen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['BLOBS', 'DOM_PARSER'],
    justification: 'Render the catalog PDF and send it in the background.',
  });
}

interface OffscreenResult { success: boolean; data?: { catalogId: string; sent: string[] }; error?: string; }

function sendToOffscreen(payload: unknown): Promise<OffscreenResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'RUN_JOB', payload }, (resp: OffscreenResult) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(resp ?? { success: false, error: 'No response from background renderer.' });
    });
  });
}

function notify(title: string, message: string): void {
  try {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/128.png', title, message,
    });
  } catch { /* notifications permission may be unavailable */ }
}

/** Selects the products that best match the source items, per {@link BackgroundJob.matchMode}. */
function selectProducts(job: BackgroundJob, candidates: Product[]): Product[] {
  const usesMatch = job.matchMode === 'per-item' || job.matchMode === 'both';
  if (!usesMatch || job.sourceItems.length === 0) return candidates;

  const picked = new Map<string, Product>();
  for (const item of job.sourceItems) {
    for (const c of rankSimilar(item, candidates, 3)) picked.set(c.url || c.id, c);
  }
  const matched = [...picked.values()];
  return job.matchMode === 'both' ? dedup([...matched, ...candidates]) : matched;
}

/** Runs a single job end-to-end, updating its persisted status as it goes. */
export async function runJob(jobId: string): Promise<void> {
  const job = await storageManager.getJob(jobId);
  if (!job || job.status === 'done' || job.status === 'error') return;

  await storageManager.updateJob(jobId, { status: 'running', progress: 5, message: 'Searching marketplaces…' });
  try {
    const options = { mode: job.mode, maxPages: job.maxPages };
    const scans = await crawlMarketplaces(job.targetMarketplaces, job.keywords, options, (p) => {
      void storageManager.updateJob(jobId, { message: p.message });
    });

    const candidates = dedup(scans.flatMap((s) => s.products));
    if (candidates.length === 0) throw new Error('No similar items found on the selected websites.');

    const finalProducts = selectProducts(job, candidates).slice(0, MAX_ITEMS);
    if (finalProducts.length === 0) throw new Error('No products matched closely enough to send.');

    await storageManager.updateJob(jobId, { status: 'sending', progress: 70, message: 'Building & sending catalog…' });
    const settings: Settings = await storageManager.getSettings();
    await ensureOffscreen();
    const resp = await sendToOffscreen({
      products: finalProducts, settings, marketplace: primaryMarketplace(scans),
      searchKeywords: job.keywords, pageCount: 1, destinations: job.destinations,
    });
    if (!resp.success || !resp.data) throw new Error(resp.error ?? 'Sending failed.');

    const sentLabel = resp.data.sent.length ? `sent by ${resp.data.sent.join(' & ')}` : 'saved';
    await storageManager.updateJob(jobId, {
      status: 'done', progress: 100, resultCatalogId: resp.data.catalogId,
      message: `Catalog ${resp.data.catalogId} ${sentLabel}`,
    });
    notify('Catalog ready', `Catalog ${resp.data.catalogId} was ${sentLabel}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await storageManager.updateJob(jobId, { status: 'error', message: 'Job failed', error: msg });
    notify('Catalog job failed', msg);
  } finally {
    try { if (await hasOffscreen()) await chrome.offscreen.closeDocument(); } catch { /* already closed */ }
  }
}

let processing = false;

/** Drains queued/interrupted jobs one at a time. Safe to call repeatedly. */
export async function processJobQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (;;) {
      const jobs = await storageManager.listJobs();
      const next = [...jobs].reverse().find((j) => j.status === 'queued' || j.status === 'running' || j.status === 'sending');
      if (!next) break;
      await runJob(next.id);
    }
  } finally {
    processing = false;
  }
}
