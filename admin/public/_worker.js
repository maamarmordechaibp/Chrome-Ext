// Cloudflare Pages advanced-mode worker for the admin site.
//
// Why this exists: some corporate content filters block the browser from
// reaching *.workers.dev directly (they return a block page with no CORS
// headers). This proxy lets the browser call the SAME origin it loaded from
// (ext.codelabsus.com) under /api/*, and forwards those requests edge-to-edge
// to the Cloudflare Worker — a server-side hop that is not subject to the
// browser's network filter. Everything else is served from the static build.
const WORKER = 'https://catalog-fax-worker.3762437.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // "/api/admin/users" -> "https://<worker>/admin/users"
      const target = WORKER + url.pathname.slice(4) + url.search;
      const headers = new Headers();
      for (const h of ['authorization', 'content-type', 'origin']) {
        const v = request.headers.get(h);
        if (v) headers.set(h, v);
      }
      const method = request.method;
      const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
      const resp = await fetch(target, { method, headers, body });
      // Pass the worker's response back, but never let an /api response be
      // cached (by the browser, the edge, or a proxy) — a stale cached page
      // here would break the app on the next load.
      const outHeaders = new Headers(resp.headers);
      outHeaders.set('Cache-Control', 'no-store');
      return new Response(resp.body, { status: resp.status, headers: outHeaders });
    }
    return env.ASSETS.fetch(request);
  },
};
