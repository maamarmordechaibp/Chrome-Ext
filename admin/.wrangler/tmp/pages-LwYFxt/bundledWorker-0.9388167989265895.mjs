// _worker.js
var WORKER = "https://catalog-fax-worker.3762437.workers.dev";
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const target = WORKER + url.pathname.slice(4) + url.search;
      const headers = new Headers();
      for (const h of ["authorization", "content-type", "origin"]) {
        const v = request.headers.get(h);
        if (v) headers.set(h, v);
      }
      const method = request.method;
      const body = method === "GET" || method === "HEAD" ? void 0 : await request.arrayBuffer();
      const resp = await fetch(target, { method, headers, body });
      const outHeaders = new Headers(resp.headers);
      outHeaders.set("Cache-Control", "no-store");
      return new Response(resp.body, { status: resp.status, headers: outHeaders });
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=bundledWorker-0.9388167989265895.mjs.map
