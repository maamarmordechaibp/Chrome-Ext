import { useEffect, useState } from 'react';
import { api, type AdminUserRow, type Company } from '../api';

export function Users() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // New-user form.
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('');

  async function load() {
    setError('');
    try {
      const [u, c] = await Promise.all([api.listUsers(), api.listCompanies()]);
      setUsers(u.users ?? []);
      setCompanies(c.companies ?? []);
      if (!teamId && c.companies?.[0]) setTeamId(c.companies[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api.createUser({
        email: email.trim(), password, displayName: displayName.trim(), teamId,
      });
      setEmail(''); setDisplayName(''); setPassword('');
    });
  }

  return (
    <>
      <h2>New user</h2>
      <form className="card" onSubmit={createUser}>
        <div className="row">
          <input placeholder="Email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Name" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} />
          <input placeholder="Temp password" type="text" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={busy || !email.trim() || password.length < 6 || !teamId}>
            Create user
          </button>
        </div>
        <div className="muted">Password must be at least 6 characters.</div>
      </form>

      {error && <div className="err">{error}</div>}

      <h2>Users</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>User</th><th>Company</th>
              <th>Faxes</th><th>Catalogs</th><th>Lookups</th><th>Logins</th>
              <th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div>{u.displayName || '—'}</div>
                  <div className="muted">{u.email}</div>
                </td>
                <td>
                  <select
                    value={u.teamId ?? ''} disabled={busy}
                    onChange={(e) => run(() => api.reassign(u.id, e.target.value))}
                  >
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td>{u.usage_faxes ?? 0}</td>
                <td>{u.usage_catalogs ?? 0}</td>
                <td>{u.usage_lookups ?? 0}</td>
                <td>{u.usage_logins ?? 0}</td>
                <td>
                  <span className={`badge${u.disabled ? ' off' : ''}`}>
                    {u.disabled ? 'Disabled' : 'Active'}
                  </span>
                </td>
                <td>
                  <div className="row">
                    <button className="ghost" disabled={busy}
                      onClick={() => run(() => api.setDisabled(u.id, !u.disabled))}>
                      {u.disabled ? 'Enable' : 'Disable'}
                    </button>
                    <button className="ghost" disabled={busy} onClick={() => {
                      const pw = window.prompt(`New password for ${u.email} (min 6 chars):`);
                      if (pw && pw.length >= 6) run(() => api.setPassword(u.id, pw));
                    }}>
                      Reset password
                    </button>
                    <button className="danger" disabled={busy} onClick={() => {
                      if (window.confirm(`Delete ${u.email}? This cannot be undone.`)) {
                        run(() => api.deleteUser(u.id));
                      }
                    }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={8} className="muted">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
