// Client for the Cloudflare Worker: fax/email a catalog PDF and record usage.
// Requests carry the signed-in rep's Firebase ID token; the Worker verifies it.
import { auth } from './firebase';

// Routed through the ext.codelabsus.com /api proxy (a Cloudflare Pages Function
// that forwards to the Worker edge-to-edge) instead of *.workers.dev directly,
// because some corporate content filters block the browser from reaching
// *.workers.dev. See admin/public/_worker.js.
const WORKER_URL = 'https://ext.codelabsus.com/api';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

async function errorText(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
}

/** Faxes a PDF via SignalWire (through the Worker). Counts as a "send". */
export async function sendFax(pdf: Blob, to: string): Promise<void> {
  const pdfBase64 = await blobToBase64(pdf);
  const res = await fetch(`${WORKER_URL}/fax`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ to, pdfBase64 }),
  });
  if (!res.ok) throw new Error(await errorText(res, `Fax failed (${res.status})`));
}

/** Emails a PDF as an attachment via Resend (through the Worker). */
export async function sendEmail(
  pdf: Blob,
  to: string,
  subject: string,
  filename: string,
): Promise<void> {
  const pdfBase64 = await blobToBase64(pdf);
  const res = await fetch(`${WORKER_URL}/email`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ to, subject, pdfBase64, filename }),
  });
  if (!res.ok) throw new Error(await errorText(res, `Email failed (${res.status})`));
}

export type UsageType = 'faxes' | 'catalogs' | 'lookups' | 'logins';
/** Reserves a block of `count` globally-unique item numbers for the team and
 *  returns the first number in the block. Item numbers never repeat, so a bare
 *  item number identifies exactly one product. */
export async function reserveItems(count: number): Promise<number> {
  const res = await fetch(`${WORKER_URL}/catalog/reserve-items`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error(await errorText(res, 'Could not reserve item numbers'));
  const data = (await res.json()) as { start: number };
  return data.start;
}

/** Records a usage event. Best-effort — never blocks or throws into the UI. */
export async function logUsage(type: UsageType): Promise<void> {
  try {
    await fetch(`${WORKER_URL}/usage/event`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ type }),
    });
  } catch {
    /* ignore */
  }
}
