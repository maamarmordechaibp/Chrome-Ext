// Admin + usage endpoints.
//
//   Super admin (role=='admin' or the bootstrap admin email):
//     GET  /admin/companies              list all teams
//     POST /admin/companies              { name, ownerEmail?, ownerPassword?, ownerName? }
//                                        -> create team + optional owner login
//     POST /admin/companies/update       { id, name?, logo? } -> rename / set logo
//     POST /admin/companies/delete       { id } -> delete team + its members/secrets
//     POST /admin/users/reassign         { uid, teamId } -> move a rep to another team
//
//   Super admin OR the company owner (role=='owner', own team only):
//     GET  /admin/users                  list user profiles (owner: own team only)
//     POST /admin/users                  { email,password,displayName,teamId? } -> create rep
//     POST /admin/users/password         { uid, password }
//     POST /admin/users/disable          { uid, disabled }
//     POST /admin/users/delete           { uid }
//     GET  /admin/company-settings?teamId=…   read delivery settings (secrets masked)
//     POST /admin/company-settings       { teamId, emailFrom?, resendApiKey?,
//                                          signalwireProjectId?, signalwireSpace?,
//                                          signalwireFaxFrom?, signalwireToken? }
//
//   Usage (any signed-in rep):
//     POST /usage/event                  { type: faxes|catalogs|lookups|logins }
import type { Env } from './index';
import { verifyFirebaseToken, type FirebaseUser } from './auth';
import { json } from './http';
import {
  createUser, deleteUser, setClaims, setDisabled, setPassword,
} from './identity';
import {
  deleteDoc, getDoc, incrementFields, listDocs, setDoc,
} from './firestore';

const USAGE_TYPES = ['faxes', 'catalogs', 'lookups', 'logins'] as const;
type UsageType = (typeof USAGE_TYPES)[number];

// Fields a company owner may set on their team_secrets doc. Secret values are
// stored but never returned to the client (see maskSettings).
const SECRET_FIELDS = ['resendApiKey', 'signalwireToken'] as const;
const PLAIN_SETTING_FIELDS = [
  'emailFrom', 'signalwireProjectId', 'signalwireSpace', 'signalwireFaxFrom',
] as const;

async function authUser(req: Request, env: Env): Promise<FirebaseUser | null> {
  const authz = req.headers.get('Authorization') ?? '';
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!idToken) return null;
  try {
    return await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID);
  } catch {
    return null;
  }
}

function isSuperAdmin(user: FirebaseUser, env: Env): boolean {
  return user.role === 'admin' || (!!env.BOOTSTRAP_ADMIN_EMAIL && user.email === env.BOOTSTRAP_ADMIN_EMAIL);
}

function isOwner(user: FirebaseUser): boolean {
  return user.role === 'owner' && !!user.teamId;
}

/** Records a usage event for the signed-in rep. */
export async function handleUsage(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: 'Unauthorized' }, 401, env, req);

  const { type } = (await req.json()) as { type?: string };
  if (!type || !USAGE_TYPES.includes(type as UsageType)) {
    return json({ error: 'Invalid usage type' }, 400, env, req);
  }
  await incrementFields(env, 'users', user.uid, { [`usage_${type}`]: 1 });
  return json({ ok: true }, 200, env, req);
}

/** Routes /admin/* endpoints after enforcing the admin gate. */
export async function handleAdmin(req: Request, env: Env, path: string): Promise<Response> {
  const user = await authUser(req, env);
  if (!user) return json({ error: 'Unauthorized' }, 401, env, req);
  const superAdmin = isSuperAdmin(user, env);
  const owner = isOwner(user);
  if (!superAdmin && !owner) return json({ error: 'Forbidden' }, 403, env, req);

  // Owners may only ever touch their own team; super admins touch any team.
  const canTeam = (teamId?: string): boolean =>
    superAdmin || (owner && !!teamId && teamId === user.teamId);

  // Companies (teams)
  if (path === '/admin/companies' && req.method === 'GET') {
    const all = await listDocs(env, 'teams');
    const companies = superAdmin ? all : all.filter((c) => c.id === user.teamId);
    return json({ companies }, 200, env, req);
  }
  if (path === '/admin/companies' && req.method === 'POST') {
    if (!superAdmin) return json({ error: 'Forbidden' }, 403, env, req);
    const { name, ownerEmail, ownerPassword, ownerName } = (await req.json()) as {
      name?: string; ownerEmail?: string; ownerPassword?: string; ownerName?: string;
    };
    if (!name) return json({ error: 'name required' }, 400, env, req);
    const id = crypto.randomUUID();
    await setDoc(env, 'teams', id, { name, createdAt: Date.now() });
    // Optionally create the company's boss login (role=owner) in one step.
    let ownerUid: string | undefined;
    if (ownerEmail && ownerPassword) {
      if (ownerPassword.length < 6) {
        return json({ error: 'owner password must be at least 6 characters' }, 400, env, req);
      }
      ownerUid = await createUser(env, ownerEmail, ownerPassword, ownerName ?? '');
      await setClaims(env, ownerUid, { role: 'owner', teamId: id });
      await setDoc(env, 'users', ownerUid, {
        email: ownerEmail, displayName: ownerName ?? '', teamId: id, role: 'owner',
        disabled: false, createdAt: Date.now(),
        usage_faxes: 0, usage_catalogs: 0, usage_lookups: 0, usage_logins: 0,
      });
    }
    return json({ id, name, ownerUid }, 200, env, req);
  }
  if (path === '/admin/companies/update' && req.method === 'POST') {
    if (!superAdmin) return json({ error: 'Forbidden' }, 403, env, req);
    const { id, name, logo } = (await req.json()) as {
      id?: string; name?: string; logo?: string | null;
    };
    if (!id) return json({ error: 'id required' }, 400, env, req);
    const patch: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) patch.name = name.trim();
    if (logo !== undefined) patch.logo = logo; // string sets it, null clears it
    if (Object.keys(patch).length === 0) return json({ error: 'nothing to update' }, 400, env, req);
    await setDoc(env, 'teams', id, patch);
    return json({ ok: true }, 200, env, req);
  }
  if (path === '/admin/companies/delete' && req.method === 'POST') {
    if (!superAdmin) return json({ error: 'Forbidden' }, 403, env, req);
    const { id } = (await req.json()) as { id?: string };
    if (!id) return json({ error: 'id required' }, 400, env, req);
    // Remove every rep/owner login belonging to this team so no orphaned
    // accounts remain, then delete the team's secrets and the team itself.
    const members = (await listDocs(env, 'users')).filter((u) => u.teamId === id);
    for (const m of members) {
      const uid = m.id as string;
      try { await deleteUser(env, uid); } catch { /* auth record may already be gone */ }
      await deleteDoc(env, 'users', uid);
    }
    await deleteDoc(env, 'team_secrets', id);
    await deleteDoc(env, 'teams', id);
    return json({ ok: true }, 200, env, req);
  }

  // Company delivery settings (Resend + SignalWire). Owner: own team only.
  if (path === '/admin/company-settings' && req.method === 'GET') {
    const teamId = new URL(req.url).searchParams.get('teamId') ?? '';
    if (!teamId) return json({ error: 'teamId required' }, 400, env, req);
    if (!canTeam(teamId)) return json({ error: 'Forbidden' }, 403, env, req);
    const doc = await getDoc(env, 'team_secrets', teamId);
    return json({ settings: maskSettings(doc) }, 200, env, req);
  }
  if (path === '/admin/company-settings' && req.method === 'POST') {
    const body = (await req.json()) as Record<string, unknown>;
    const teamId = typeof body.teamId === 'string' ? body.teamId : '';
    if (!teamId) return json({ error: 'teamId required' }, 400, env, req);
    if (!canTeam(teamId)) return json({ error: 'Forbidden' }, 403, env, req);
    const patch: Record<string, unknown> = {};
    for (const f of PLAIN_SETTING_FIELDS) {
      if (typeof body[f] === 'string') patch[f] = (body[f] as string).trim();
    }
    // Secrets are only overwritten when a non-empty value is supplied; passing
    // an empty string explicitly clears the stored secret.
    for (const f of SECRET_FIELDS) {
      if (typeof body[f] === 'string') patch[f] = (body[f] as string).trim();
    }
    if (Object.keys(patch).length === 0) return json({ error: 'nothing to update' }, 400, env, req);
    await setDoc(env, 'team_secrets', teamId, patch);
    return json({ ok: true }, 200, env, req);
  }

  // Users
  if (path === '/admin/users' && req.method === 'GET') {
    const all = await listDocs(env, 'users');
    const users = superAdmin ? all : all.filter((u) => u.teamId === user.teamId);
    return json({ users }, 200, env, req);
  }
  if (path === '/admin/users' && req.method === 'POST') {
    const { email, password, displayName, teamId } = (await req.json()) as {
      email?: string; password?: string; displayName?: string; teamId?: string;
    };
    // Owners always create reps inside their own team; super admins choose.
    const targetTeam = superAdmin ? teamId : user.teamId;
    if (!email || !password || !targetTeam) {
      return json({ error: 'email, password, teamId required' }, 400, env, req);
    }
    if (!canTeam(targetTeam)) return json({ error: 'Forbidden' }, 403, env, req);
    const uid = await createUser(env, email, password, displayName ?? '');
    await setClaims(env, uid, { role: 'member', teamId: targetTeam });
    await setDoc(env, 'users', uid, {
      email, displayName: displayName ?? '', teamId: targetTeam, role: 'member',
      disabled: false, createdAt: Date.now(),
      usage_faxes: 0, usage_catalogs: 0, usage_lookups: 0, usage_logins: 0,
    });
    return json({ uid }, 200, env, req);
  }
  if (path === '/admin/users/password' && req.method === 'POST') {
    const { uid, password } = (await req.json()) as { uid?: string; password?: string };
    if (!uid || !password) return json({ error: 'uid, password required' }, 400, env, req);
    if (!(await canManageUser(env, user, superAdmin, uid))) return json({ error: 'Forbidden' }, 403, env, req);
    await setPassword(env, uid, password);
    return json({ ok: true }, 200, env, req);
  }
  if (path === '/admin/users/disable' && req.method === 'POST') {
    const { uid, disabled } = (await req.json()) as { uid?: string; disabled?: boolean };
    if (!uid || typeof disabled !== 'boolean') {
      return json({ error: 'uid, disabled required' }, 400, env, req);
    }
    if (!(await canManageUser(env, user, superAdmin, uid))) return json({ error: 'Forbidden' }, 403, env, req);
    await setDisabled(env, uid, disabled);
    await setDoc(env, 'users', uid, { disabled });
    return json({ ok: true }, 200, env, req);
  }
  if (path === '/admin/users/reassign' && req.method === 'POST') {
    if (!superAdmin) return json({ error: 'Forbidden' }, 403, env, req);
    const { uid, teamId } = (await req.json()) as { uid?: string; teamId?: string };
    if (!uid || !teamId) return json({ error: 'uid, teamId required' }, 400, env, req);
    await setClaims(env, uid, { role: 'member', teamId });
    await setDoc(env, 'users', uid, { teamId });
    return json({ ok: true }, 200, env, req);
  }
  if (path === '/admin/users/delete' && req.method === 'POST') {
    const { uid } = (await req.json()) as { uid?: string };
    if (!uid) return json({ error: 'uid required' }, 400, env, req);
    if (!(await canManageUser(env, user, superAdmin, uid))) return json({ error: 'Forbidden' }, 403, env, req);
    await deleteUser(env, uid);
    await deleteDoc(env, 'users', uid);
    return json({ ok: true }, 200, env, req);
  }

  return json({ error: 'Not found' }, 404, env, req);
}

/** True when the caller may act on the target user: super admins always may;
 *  owners only for reps inside their own team. */
async function canManageUser(
  env: Env, user: FirebaseUser, superAdmin: boolean, uid: string,
): Promise<boolean> {
  if (superAdmin) return true;
  if (!isOwner(user)) return false;
  const target = await getDoc(env, 'users', uid);
  return !!target && target.teamId === user.teamId;
}

/** Returns delivery settings safe to send to the client: plain fields as-is,
 *  secrets replaced by a boolean flag so keys are never exposed. */
function maskSettings(doc: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PLAIN_SETTING_FIELDS) out[f] = (doc?.[f] as string) ?? '';
  out.hasResendKey = !!(doc?.resendApiKey);
  out.hasSignalwireToken = !!(doc?.signalwireToken);
  return out;
}
