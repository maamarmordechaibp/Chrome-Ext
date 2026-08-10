// Shared HTTP helpers: CORS + JSON responses for the Worker's endpoints.
import type { Env } from './index';

/** Echoes the request Origin when it's on the allowlist (extension + admin). */
export function corsHeaders(env: Env, req?: Request): Record<string, string> {
  let allow = '*';
  if (req) {
    const origin = req.headers.get('Origin') ?? '';
    // ADMIN_ORIGIN may hold several comma-separated origins (e.g. the custom
    // domain plus the old Pages URL) so the admin site keeps working after a
    // domain change without a code edit.
    const adminOrigins = (env.ADMIN_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const allowed = [env.ALLOWED_ORIGIN, ...adminOrigins].filter(Boolean) as string[];
    allow = allowed.includes(origin) ? origin : env.ALLOWED_ORIGIN || '*';
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Prevent any intermediary (corporate proxy / TLS-intercepting filter) from
    // caching an API response and serving it back without CORS headers.
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function json(data: unknown, status: number, env: Env, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, req) },
  });
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
