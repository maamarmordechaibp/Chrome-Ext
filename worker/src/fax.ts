// SignalWire fax sending + short-lived media hosting.
//
// SignalWire's fax API fetches the document from a public "MediaUrl", so we
// stash the PDF in Workers KV under an unguessable token with a short TTL,
// hand SignalWire that URL, and let it expire. No persistent storage.
import type { Env } from './index';

const MEDIA_TTL_SECONDS = 900; // 15 min: enough for SignalWire to fetch + retry.

/** Per-company SignalWire overrides; fall back to the Worker's global config. */
export interface FaxOverrides {
  space?: string;
  projectId?: string;
  token?: string;
  faxFrom?: string;
}
/** Stores the PDF and returns an unguessable token to build its MediaUrl. */
export async function storeMedia(env: Env, pdf: ArrayBuffer): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '');
  await env.MEDIA.put(`media:${token}`, pdf, { expirationTtl: MEDIA_TTL_SECONDS });
  return token;
}

/** Serves a stored PDF to SignalWire. Public but token-guarded + short-lived. */
export async function serveMedia(env: Env, token: string): Promise<Response> {
  const data = await env.MEDIA.get(`media:${token}`, 'arrayBuffer');
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(data, {
    headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
  });
}

/** Coerces a user-typed fax number into E.164, which SignalWire requires.
 *  Accepts common US formats like "(845) 241-3473" or "845-241-3473". */
function toE164(raw: string): string {
  const t = (raw || '').trim();
  if (t.startsWith('+')) return '+' + t.slice(1).replace(/\D/g, '');
  const digits = t.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : t;
}

/** Sends a fax via SignalWire's Compatibility (LaML) API. */
export async function sendFax(
  env: Env,
  to: string,
  mediaUrl: string,
  overrides: FaxOverrides = {},
): Promise<{ sid: string; status: string }> {
  const space = overrides.space || env.SIGNALWIRE_SPACE;
  const projectId = overrides.projectId || env.SIGNALWIRE_PROJECT_ID;
  const token = overrides.token || env.SIGNALWIRE_API_TOKEN;
  const faxFrom = overrides.faxFrom || env.SIGNALWIRE_FAX_FROM;
  const url =
    `https://${space}/api/laml/2010-04-01/Accounts/` +
    `${projectId}/Faxes.json`;
  const body = new URLSearchParams({
    From: toE164(faxFrom),
    To: toE164(to),
    MediaUrl: mediaUrl,
  });
  const auth = btoa(`${projectId}:${token}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`SignalWire error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { sid: string; status: string };
  return { sid: data.sid, status: data.status };
}
