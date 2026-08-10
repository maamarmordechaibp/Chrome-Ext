// Entry point + router.
//   POST /fax              auth check, then send a PDF as a fax via SignalWire
//   GET  /media/:tok       SignalWire fetches the PDF here (short-lived)
//   POST /usage/event      record a rep usage event (faxes|catalogs|lookups|logins)
//   /admin/*               admin-only company + user management
import { verifyFirebaseToken } from './auth';
import { sendFax, serveMedia, storeMedia } from './fax';
import { sendEmail } from './email';
import { handleAdmin, handleUsage } from './admin';
import { incrementAndGet, incrementFields } from './firestore';
import { emailOverrides, faxOverrides, loadTeamSecrets } from './creds';
import { base64ToArrayBuffer, corsHeaders, json } from './http';

export interface Env {
  MEDIA: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  SIGNALWIRE_SPACE: string;
  SIGNALWIRE_PROJECT_ID: string;
  SIGNALWIRE_API_TOKEN: string; // secret
  SIGNALWIRE_FAX_FROM: string;
  WORKER_PUBLIC_URL: string;
  ALLOWED_ORIGIN: string;
  ADMIN_ORIGIN: string;
  // Service account for admin (Identity Toolkit + Firestore) REST calls.
  SA_CLIENT_EMAIL: string;
  SA_PRIVATE_KEY: string; // secret (PEM)
  BOOTSTRAP_ADMIN_EMAIL: string;
  // Resend (email delivery).
  RESEND_API_KEY: string; // secret
  EMAIL_FROM: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      // Ensure even unexpected errors carry CORS headers (so the browser shows
      // the real message instead of an opaque CORS failure).
      console.error('Worker error:', (e as Error)?.stack || e);
      return json({ error: (e as Error).message || 'Internal error' }, 500, env, req);
    }
  },
};

async function route(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env, req) });
    }

    // SignalWire fetches the PDF from here. No auth: guarded by the unguessable
    // token in the path and a short KV TTL.
    if (req.method === 'GET' && pathname.startsWith('/media/')) {
      return serveMedia(env, pathname.slice('/media/'.length));
    }

    if (pathname.startsWith('/admin/')) {
      return handleAdmin(req, env, pathname);
    }

    if (req.method === 'POST' && pathname === '/usage/event') {
      return handleUsage(req, env);
    }

    // Reserves a block of globally-unique item numbers for the caller's team,
    // so a bare item number identifies exactly one product across all catalogs.
    if (req.method === 'POST' && pathname === '/catalog/reserve-items') {
      const authz = req.headers.get('Authorization') ?? '';
      const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
      if (!idToken) return json({ error: 'Missing token' }, 401, env, req);
      let teamId: string | undefined;
      try {
        ({ teamId } = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID));
      } catch {
        return json({ error: 'Unauthorized' }, 401, env, req);
      }
      if (!teamId) return json({ error: 'Your account has no team.' }, 400, env, req);
      const { count } = (await req.json()) as { count?: number };
      if (!count || count < 1) return json({ error: 'count required' }, 400, env, req);
      const total = await incrementAndGet(env, 'counters', teamId, 'item_seq', count);
      // Base of 1000 so the very first item ever is #1001.
      const start = total - count + 1001;
      return json({ start }, 200, env, req);
    }

    if (req.method === 'POST' && pathname === '/email') {
      const authz = req.headers.get('Authorization') ?? '';
      const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
      if (!idToken) return json({ error: 'Missing token' }, 401, env, req);
      let uid: string;
      let teamId: string | undefined;
      try {
        ({ uid, teamId } = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID));
      } catch {
        return json({ error: 'Unauthorized' }, 401, env, req);
      }

      const { to, subject, pdfBase64, filename } = (await req.json()) as {
        to?: string; subject?: string; pdfBase64?: string; filename?: string;
      };
      if (!to || !pdfBase64) {
        return json({ error: 'to and pdfBase64 are required' }, 400, env, req);
      }
      try {
        const secrets = await loadTeamSecrets(env, teamId);
        const result = await sendEmail(
          env, to, subject ?? 'Your catalog', pdfBase64, filename ?? 'catalog.pdf',
          emailOverrides(secrets),
        );
        await incrementFields(env, 'users', uid, { usage_faxes: 1 });
        return json(result, 200, env, req);
      } catch (e) {
        return json({ error: (e as Error).message }, 502, env, req);
      }
    }

    if (req.method === 'POST' && pathname === '/fax') {
      // 1) Only signed-in reps may send.
      const authz = req.headers.get('Authorization') ?? '';
      const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
      if (!idToken) return json({ error: 'Missing token' }, 401, env, req);
      let uid: string;
      let teamId: string | undefined;
      try {
        ({ uid, teamId } = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID));
      } catch {
        return json({ error: 'Unauthorized' }, 401, env, req);
      }

      // 2) Validate input.
      const { to, pdfBase64 } = (await req.json()) as {
        to?: string;
        pdfBase64?: string;
      };
      if (!to || !pdfBase64) {
        return json({ error: 'to and pdfBase64 are required' }, 400, env, req);
      }

      // 3) Stash the PDF briefly, build its fetchable URL, send.
      const token = await storeMedia(env, base64ToArrayBuffer(pdfBase64));
      const mediaUrl = `${env.WORKER_PUBLIC_URL}/media/${token}`;
      try {
        const secrets = await loadTeamSecrets(env, teamId);
        const result = await sendFax(env, to, mediaUrl, faxOverrides(secrets));
        await incrementFields(env, 'users', uid, { usage_faxes: 1 });
        return json(result, 200, env, req);
      } catch (e) {
        return json({ error: (e as Error).message }, 502, env, req);
      }
    }

    return json({ error: 'Not found' }, 404, env, req);
}
