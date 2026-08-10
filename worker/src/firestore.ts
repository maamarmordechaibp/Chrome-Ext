// Minimal Firestore REST client for the Worker: read/write team + user profile
// documents and atomically increment per-user usage counters. Authenticated
// with the same service-account access token as the Identity admin calls.
import type { Env } from './index';
import { getAccessToken } from './google';

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null };

function toValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}

function fromValue(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  return null;
}

function toFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = toValue(val);
  return out;
}

function fromFields(fields: Record<string, Record<string, unknown>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) out[k] = fromValue(val);
  return out;
}

function docBase(env: Env): string {
  return (
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents`
  );
}

async function authed(env: Env, url: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken(env);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  });
}

/** Reads a single document; returns null if it does not exist. */
export async function getDoc(
  env: Env,
  collection: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const res = await authed(env, `${docBase(env)}/${collection}/${id}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { fields?: Record<string, Record<string, unknown>> };
  return { id, ...fromFields(data.fields) };
}

/** Lists all documents in a collection (single page, up to 300). */
export async function listDocs(
  env: Env,
  collection: string,
): Promise<Record<string, unknown>[]> {
  const res = await authed(env, `${docBase(env)}/${collection}?pageSize=300`, { method: 'GET' });
  if (!res.ok) throw new Error(`Firestore list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    documents?: { name: string; fields?: Record<string, Record<string, unknown>> }[];
  };
  return (data.documents ?? []).map((d) => ({
    id: d.name.split('/').pop(),
    ...fromFields(d.fields),
  }));
}

/** Creates or replaces the given fields on a document (merges by field mask). */
export async function setDoc(
  env: Env,
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const mask = Object.keys(data)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const res = await authed(env, `${docBase(env)}/${collection}/${id}?${mask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore set failed: ${res.status} ${await res.text()}`);
}

/** Deletes a document. Succeeds even if it does not exist. */
export async function deleteDoc(env: Env, collection: string, id: string): Promise<void> {
  const res = await authed(env, `${docBase(env)}/${collection}/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore delete failed: ${res.status} ${await res.text()}`);
  }
}

/** Atomically increments numeric counter fields on a document. */
export async function incrementFields(
  env: Env,
  collection: string,
  id: string,
  increments: Record<string, number>,
): Promise<void> {
  const fieldTransforms = Object.entries(increments).map(([field, by]) => ({
    fieldPath: field,
    increment: { integerValue: String(by) },
  }));
  const body = {
    writes: [
      {
        transform: {
          document: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}`,
          fieldTransforms,
        },
      },
    ],
  };
  const res = await authed(env, `${docBase(env)}:commit`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore increment failed: ${res.status} ${await res.text()}`);
}

/** Atomically increments one counter field and returns the resulting value. */
export async function incrementAndGet(
  env: Env,
  collection: string,
  id: string,
  field: string,
  by: number,
): Promise<number> {
  const body = {
    writes: [
      {
        transform: {
          document: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}`,
          fieldTransforms: [{ fieldPath: field, increment: { integerValue: String(by) } }],
        },
      },
    ],
  };
  const res = await authed(env, `${docBase(env)}:commit`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore increment failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    writeResults?: { transformResults?: { integerValue?: string }[] }[];
  };
  const value = data.writeResults?.[0]?.transformResults?.[0]?.integerValue;
  return Number(value ?? 0);
}
