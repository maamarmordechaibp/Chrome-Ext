import { useEffect, useState } from 'react';
import { api, type CompanySettings as Settings, type CompanySettingsPatch } from '../api';

/**
 * Editor for a company's delivery settings: the "from" email address plus a
 * custom Resend API key (email) and SignalWire credentials (fax). Secret keys
 * are write-only — the server never returns them, so we show whether one is set
 * and let the user replace it. Used both by a company owner (their own team)
 * and by the super admin (any team).
 */
export function CompanySettings({ teamId }: { teamId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Plain fields (editable text).
  const [emailFrom, setEmailFrom] = useState('');
  const [swProject, setSwProject] = useState('');
  const [swSpace, setSwSpace] = useState('');
  const [swFrom, setSwFrom] = useState('');
  // Secret fields (blank = keep existing; typing = replace).
  const [resendKey, setResendKey] = useState('');
  const [swToken, setSwToken] = useState('');

  async function load() {
    setError(''); setSaved(false);
    try {
      const { settings: s } = await api.getCompanySettings(teamId);
      setSettings(s);
      setEmailFrom(s.emailFrom); setSwProject(s.signalwireProjectId);
      setSwSpace(s.signalwireSpace); setSwFrom(s.signalwireFaxFrom);
      setResendKey(''); setSwToken('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teamId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    try {
      const patch: CompanySettingsPatch = {
        emailFrom: emailFrom.trim(),
        signalwireProjectId: swProject.trim(),
        signalwireSpace: swSpace.trim(),
        signalwireFaxFrom: swFrom.trim(),
      };
      if (resendKey.trim()) patch.resendApiKey = resendKey.trim();
      if (swToken.trim()) patch.signalwireToken = swToken.trim();
      await api.updateCompanySettings(teamId, patch);
      setSaved(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <div className="muted">{error || 'Loading settings…'}</div>;
  }

  return (
    <form className="card" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>Email (Resend)</h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        The address catalogs are emailed from, plus your own Resend API key.
        Leave the key blank to keep the current one.
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input placeholder="From, e.g. Sales &lt;sales@yourco.com&gt;" style={{ minWidth: 260 }}
          value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} />
        <input placeholder={settings.hasResendKey ? 'Resend API key (set — type to replace)' : 'Resend API key'}
          type="password" style={{ minWidth: 260 }} autoComplete="new-password"
          value={resendKey} onChange={(e) => setResendKey(e.target.value)} />
      </div>

      <h3>Fax (SignalWire)</h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        Your SignalWire space, project ID, fax "from" number, and API token.
        Leave the token blank to keep the current one.
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input placeholder="Space, e.g. yourco.signalwire.com" style={{ minWidth: 220 }}
          value={swSpace} onChange={(e) => setSwSpace(e.target.value)} />
        <input placeholder="Project ID" style={{ minWidth: 220 }}
          value={swProject} onChange={(e) => setSwProject(e.target.value)} />
        <input placeholder="Fax from number, e.g. +18450000000" style={{ minWidth: 220 }}
          value={swFrom} onChange={(e) => setSwFrom(e.target.value)} />
        <input placeholder={settings.hasSignalwireToken ? 'API token (set — type to replace)' : 'API token'}
          type="password" style={{ minWidth: 220 }} autoComplete="new-password"
          value={swToken} onChange={(e) => setSwToken(e.target.value)} />
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
        <button disabled={busy}>Save settings</button>
        {saved && <span className="muted">Saved.</span>}
        {error && <span className="err">{error}</span>}
      </div>
    </form>
  );
}
