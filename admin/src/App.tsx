import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import { getClaims } from './api';
import { Login } from './components/Login';
import { Companies } from './components/Companies';
import { Users } from './components/Users';
import { CompanySettings } from './components/CompanySettings';

type Tab = 'users' | 'companies' | 'settings';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<string | undefined>();
  const [teamId, setTeamId] = useState<string | undefined>();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    if (u) {
      const claims = await getClaims();
      setRole(claims.role);
      setTeamId(claims.teamId);
    } else {
      setRole(undefined); setTeamId(undefined);
    }
    setReady(true);
  }), []);

  if (!ready) return <div className="wrap">Loading…</div>;
  if (!user) return <Login />;

  const isOwner = role === 'owner';
  // Super admin = the bootstrap admin (no role claim) or an explicit 'admin' role.
  // A plain member has no admin access.
  const isSuperAdmin = role === 'admin' || role === undefined;
  const noAccess = !isOwner && !isSuperAdmin;

  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Catalog Admin</h1>
        <div className="row">
          <span className="muted">{user.email}{isOwner ? ' · Owner' : ''}</span>
          <button className="ghost" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </div>

      {noAccess ? (
        <div className="card muted">
          Your account doesn't have admin access. Contact your company owner or the
          catalog administrator.
        </div>
      ) : (
        <>
          <div className="tabs">
            <button className={tab === 'users' ? 'active' : 'ghost'} onClick={() => setTab('users')}>
              Users
            </button>
            {isSuperAdmin && (
              <button className={tab === 'companies' ? 'active' : 'ghost'} onClick={() => setTab('companies')}>
                Companies
              </button>
            )}
            {isOwner && (
              <button className={tab === 'settings' ? 'active' : 'ghost'} onClick={() => setTab('settings')}>
                Company settings
              </button>
            )}
          </div>

          {tab === 'companies' && isSuperAdmin && <Companies />}
          {tab === 'settings' && isOwner && teamId && <CompanySettings teamId={teamId} />}
          {tab === 'users' && <Users />}
          {tab === 'settings' && isOwner && !teamId && (
            <div className="card err">Your account has no company assigned.</div>
          )}
        </>
      )}
    </div>
  );
}
