// Verifies a Firebase ID token inside the Worker so only signed-in reps can
// send faxes. Uses Google's public JWKs + WebCrypto (no Admin SDK needed).

export interface FirebaseUser {
  uid: string;
  email?: string;
  role?: string;
  teamId?: string;
}

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cache: { keys: JsonWebKey[]; expires: number } | null = null;

async function getSigningKeys(): Promise<(JsonWebKey & { kid: string })[]> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.keys as (JsonWebKey & { kid: string })[];
  const res = await fetch(JWKS_URL);
  const data = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  cache = { keys: data.keys, expires: now + 3_600_000 }; // cache 1h
  return data.keys;
}

function b64urlToBytes(input: string): Uint8Array {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

/** Throws if the token is missing, malformed, expired, or not for this project. */
export async function verifyFirebaseToken(
  token: string,
  projectId: string,
): Promise<FirebaseUser> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeJson(headerB64) as { kid?: string; alg?: string };
  const payload = decodeJson(payloadB64) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
    role?: string;
    teamId?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw new Error('Token expired');
  if (payload.aud !== projectId) throw new Error('Wrong audience');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Wrong issuer');
  }
  if (!payload.sub) throw new Error('Missing subject');

  const keys = await getSigningKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signatureB64),
    signed,
  );
  if (!valid) throw new Error('Invalid signature');

  return {
    uid: payload.sub,
    email: payload.email,
    role: payload.role,
    teamId: payload.teamId,
  };
}
