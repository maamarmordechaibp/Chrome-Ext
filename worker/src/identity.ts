// Thin wrappers over Google Identity Toolkit's admin REST API for managing user
// accounts (create/update/delete/list). Authenticated with a service-account
// access token — the equivalent of the Firebase Admin SDK, but over plain HTTP.
import type { Env } from './index';
import { getAccessToken } from './google';

export interface AdminUser {
  uid: string;
  email?: string;
  displayName?: string;
  disabled: boolean;
  role?: string;
  teamId?: string;
}

function base(env: Env): string {
  return `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}`;
}

async function call(env: Env, path: string, body: unknown): Promise<any> {
  const token = await getAccessToken(env);
  const res = await fetch(`${base(env)}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Identity API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Creates an account with a password. Returns the new uid (localId). */
export async function createUser(
  env: Env,
  email: string,
  password: string,
  displayName: string,
): Promise<string> {
  const data = await call(env, '/accounts', { email, password, displayName });
  return data.localId as string;
}

/** Sets a new password for an existing account. */
export async function setPassword(env: Env, uid: string, password: string): Promise<void> {
  await call(env, '/accounts:update', { localId: uid, password });
}

/** Enables or disables sign-in for an account. */
export async function setDisabled(env: Env, uid: string, disabled: boolean): Promise<void> {
  await call(env, '/accounts:update', { localId: uid, disableUser: disabled });
}

/** Sets custom claims (e.g. { role, teamId }) that appear in the ID token. */
export async function setClaims(
  env: Env,
  uid: string,
  claims: Record<string, unknown>,
): Promise<void> {
  await call(env, '/accounts:update', {
    localId: uid,
    customAttributes: JSON.stringify(claims),
  });
}

/** Permanently deletes an account. */
export async function deleteUser(env: Env, uid: string): Promise<void> {
  await call(env, '/accounts:delete', { localId: uid });
}
