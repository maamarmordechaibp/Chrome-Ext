import { useEffect, useRef, useState } from 'react';
import { api, type Company } from '../api';
import { CompanySettings } from './CompanySettings';

export function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      setCompanies((await api.listCompanies()).companies ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api.createCompany({
        name: name.trim(),
        ownerEmail: ownerEmail.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        ownerPassword: ownerPassword || undefined,
      });
      setName(''); setOwnerEmail(''); setOwnerName(''); setOwnerPassword('');
    });
  }

  const ownerStarted = !!(ownerEmail.trim() || ownerName.trim() || ownerPassword);
  const ownerInvalid = ownerStarted && (!ownerEmail.trim() || ownerPassword.length < 6);

  return (
    <>
      <h2>New company</h2>
      <form className="card" onSubmit={create}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="muted" style={{ margin: '8px 0 4px' }}>
          Optional: create the company's owner login. The owner can then add their
          own reps and set their email/fax API keys.
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Owner email" type="email" value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)} />
          <input placeholder="Owner name" value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)} />
          <input placeholder="Owner temp password" type="text" value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)} />
          <button disabled={busy || !name.trim() || ownerInvalid}>Create company</button>
        </div>
        {ownerInvalid && (
          <div className="muted">Owner needs an email and a password of at least 6 characters.</div>
        )}
      </form>

      {error && <div className="err">{error}</div>}

      <h2>Companies</h2>
      <div className="muted" style={{ marginBottom: 8 }}>
        The company name and logo are applied automatically to each rep's catalog
        branding when they sign in. Use "Settings" to set the company's email/fax keys.
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Logo</th><th>Name</th><th>ID</th><th></th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <CompanyRow key={c.id} company={c} busy={busy} run={run} />
            ))}
            {companies.length === 0 && (
              <tr><td colSpan={4} className="muted">No companies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CompanyRow({
  company, busy, run,
}: {
  company: Company;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(company.name ?? '');
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(company.name ?? ''); }, [company.name]);

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 512 * 1024) { alert('Please choose a logo under 500 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => run(() => api.updateCompany(company.id, { logo: reader.result as string }));
    reader.readAsDataURL(file);
  }

  const nameChanged = !!name.trim() && name.trim() !== company.name;

  return (
    <>
      <tr>
        <td>
          <div className="row" style={{ alignItems: 'center' }}>
            {company.logo
              ? <img src={company.logo} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', border: '1px solid #ddd', borderRadius: 4 }} />
              : <span className="muted">—</span>}
            <input
              ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => onLogo(e.target.files?.[0])}
            />
            <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
              {company.logo ? 'Replace' : 'Upload'}
            </button>
            {company.logo && (
              <button className="ghost" disabled={busy}
                onClick={() => run(() => api.updateCompany(company.id, { logo: null }))}>
                Remove
              </button>
            )}
          </div>
        </td>
        <td>
          <div className="row" style={{ alignItems: 'center' }}>
            <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
            {nameChanged && (
              <button disabled={busy}
                onClick={() => run(() => api.updateCompany(company.id, { name: name.trim() }))}>
                Save
              </button>
            )}
          </div>
        </td>
        <td className="muted">{company.id}</td>
        <td>
          <div className="row">
            <button className="ghost" onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? 'Hide settings' : 'Settings'}
            </button>
            <button className="danger" disabled={busy} onClick={() => {
              const label = company.name || company.id;
              if (window.confirm(
                `Delete company "${label}"?\n\nThis permanently removes the company, its ` +
                `delivery settings, and ALL of its user logins. This cannot be undone.`,
              )) {
                run(() => api.deleteCompany(company.id));
              }
            }}>
              Delete
            </button>
          </div>
        </td>
      </tr>
      {showSettings && (
        <tr>
          <td colSpan={4}>
            <CompanySettings teamId={company.id} />
          </td>
        </tr>
      )}
    </>
  );
}

