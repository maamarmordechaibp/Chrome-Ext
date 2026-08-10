// Typed client for the Worker's /admin/* endpoints. Every call attaches the
// signed-in admin's Firebase ID token; the Worker enforces the admin role.
import { auth } from './firebase';

const BASE = import.meta.env.VITE_WORKER_URL;

export interface Company {
  id: string;
  name: string;
  createdAt?: number;
  /** Company logo (base64 data URL) applied to reps' PDF branding on sign-in. */
  logo?: string;
}

export interface AdminUserRow {
  id: string; // uid
  email?: string;
  displayName?: string;
  teamId?: string;
  role?: string;
  disabled?: boolean;
  usage_faxes?: number;
  usage_catalogs?: number;
  usage_lookups?: number;
  usage_logins?: number;
}

/** Non-secret delivery settings + flags telling whether each secret is set. */
export interface CompanySettings {
  emailFrom: string;
  signalwireProjectId: string;
  signalwireSpace: string;
  signalwireFaxFrom: string;
  hasResendKey: boolean;
  hasSignalwireToken: boolean;
}

/** Fields the admin/owner may save. Secrets are only sent when changed. */
export interface CompanySettingsPatch {
  emailFrom?: string;
  signalwireProjectId?: string;
  signalwireSpace?: string;
  signalwireFaxFrom?: string;
  resendApiKey?: string;
  signalwireToken?: string;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // A non-JSON body (e.g. a cached HTML page or a proxy/block page) means the
      // request didn't reach the API cleanly. Surface a clear, actionable error
      // instead of returning an empty object that would break callers.
      throw new Error(
        !res.ok
          ? `Request failed (${res.status})`
          : 'Unexpected response from server. Please hard-refresh (Ctrl+Shift+R) and try again.',
      );
    }
  }
  if (!res.ok) throw new Error((data.error as string) ?? `Request failed (${res.status})`);
  return data as T;
}

/** Reads the signed-in user's role/team from their ID token custom claims. */
export async function getClaims(): Promise<{ role?: string; teamId?: string }> {
  const user = auth.currentUser;
  if (!user) return {};
  const res = await user.getIdTokenResult();
  return { role: res.claims.role as string | undefined, teamId: res.claims.teamId as string | undefined };
}

export const api = {
  listCompanies: () => request<{ companies: Company[] }>('/admin/companies', 'GET'),
  createCompany: (payload: {
    name: string; ownerEmail?: string; ownerPassword?: string; ownerName?: string;
  }) => request<Company & { ownerUid?: string }>('/admin/companies', 'POST', payload),
  updateCompany: (id: string, patch: { name?: string; logo?: string | null }) =>
    request<{ ok: true }>('/admin/companies/update', 'POST', { id, ...patch }),
  deleteCompany: (id: string) =>
    request<{ ok: true }>('/admin/companies/delete', 'POST', { id }),

  getCompanySettings: (teamId: string) =>
    request<{ settings: CompanySettings }>(
      `/admin/company-settings?teamId=${encodeURIComponent(teamId)}`, 'GET',
    ),
  updateCompanySettings: (teamId: string, patch: CompanySettingsPatch) =>
    request<{ ok: true }>('/admin/company-settings', 'POST', { teamId, ...patch }),

  listUsers: () => request<{ users: AdminUserRow[] }>('/admin/users', 'GET'),
  createUser: (u: { email: string; password: string; displayName: string; teamId: string }) =>
    request<{ uid: string }>('/admin/users', 'POST', u),
  setPassword: (uid: string, password: string) =>
    request<{ ok: true }>('/admin/users/password', 'POST', { uid, password }),
  setDisabled: (uid: string, disabled: boolean) =>
    request<{ ok: true }>('/admin/users/disable', 'POST', { uid, disabled }),
  reassign: (uid: string, teamId: string) =>
    request<{ ok: true }>('/admin/users/reassign', 'POST', { uid, teamId }),
  deleteUser: (uid: string) =>
    request<{ ok: true }>('/admin/users/delete', 'POST', { uid }),
};
