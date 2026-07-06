import React, { useState, useEffect } from 'react';
import { Settings as ST, CrawlMode, Team } from '../../types';
import { storageManager } from '../../storage/StorageManager';
import { useAuth } from '../../cloud/useAuth';
import { authService } from '../../cloud/authService';

/** Shows the signed-in rep's team and its join code so the owner can invite
 *  other representatives (they enter this code on the "Join Team" screen). */
const TeamPanel: React.FC = () => {
  const { profile } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile?.teamId) authService.getTeam(profile.teamId).then(setTeam);
  }, [profile?.teamId]);

  if (!profile) return null;

  const copyCode = async () => {
    if (!team) return;
    try { await navigator.clipboard.writeText(team.joinCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Team</h3>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Team name</span>
          <span className="text-xs font-semibold text-gray-800">{team?.name ?? '…'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Signed in as</span>
          <span className="text-xs text-gray-700">{profile.displayName} · {profile.role}</span>
        </div>
        <div className="pt-1 border-t border-gray-200">
          <span className="block text-[10px] text-gray-500 mb-1">Team code — share this so reps can join</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-center text-lg font-mono font-bold tracking-[0.3em] bg-white border border-gray-300 rounded py-1.5 text-blue-700">
              {team?.joinCode ?? '••••••'}
            </code>
            <button onClick={copyCode} disabled={!team}
              className="px-3 py-1.5 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">New reps pick “Join Team” at sign-in and enter this code.</p>
        </div>
      </div>
    </section>
  );
};

type BK = { [K in keyof ST]-?: ST[K] extends boolean ? K : never; }[keyof ST];
const OPTS: [BK, string][] = [
  ['showRatings',    'Show star ratings'],
  ['showReviews',    'Show review count'],
  ['showDiscounts',  'Show original price & discount'],
  ['showShipping',   'Show shipping info'],
  ['showSeller',     'Show seller name'],
  ['showBrand',      'Show brand'],
  ['showDescription','Show product description'],
  ['hidePeople',     'Hide images of people (modesty filter)'],
  ['showQRCode',     'Show QR code (future)'],
  ['showProductURL', 'Show product URL'],
];
const CRAWL_LABELS: Record<CrawlMode, string> = {
  current: 'Current page only', first: 'First N pages', all: 'All pages (up to max)',
};

export const Settings: React.FC = () => {
  const [s, setS] = useState<ST | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { storageManager.getSettings().then(setS); }, []);
  const up = <K extends keyof ST>(key: K, val: ST[K]) => { if (s) { setS({ ...s, [key]: val }); setSaved(false); } };
  const save = async () => { if (!s) return; await storageManager.saveSettings(s); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const clear = async () => { if (!confirm('Clear ALL history and settings?')) return; await storageManager.clearAll(); alert('Cleared.'); window.close(); };

  const onLogo = (file: File | undefined) => {
    if (!file || !s) return;
    if (file.size > 512 * 1024) { alert('Please choose a logo under 500 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => up('companyLogo', reader.result as string);
    reader.readAsDataURL(file);
  };

  if (!s) return <div className="p-4 text-[10px] text-gray-400">Loading…</div>;

  return (
    <div className="p-4 space-y-5">
      <TeamPanel />
      <section className="space-y-2">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">PDF Layout</h3>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Products per row</label>
          <select value={s.productsPerRow} onChange={(e) => up('productsPerRow', parseInt(e.target.value) as 1|2|3)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
            <option value={1}>1  (large cards)</option>
            <option value={2}>2  (default — best for printing)</option>
            <option value={3}>3  (compact)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Rows per page</label>
          <select value={s.rowsPerPage} onChange={(e) => up('rowsPerPage', parseInt(e.target.value) as 2|3|4)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
            <option value={2}>2 rows (4–6 items/page)</option>
            <option value={3}>3 rows (6–9 items/page)</option>
            <option value={4}>4 rows (8–12 items/page)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Starting item number</label>
          <input type="number" min={1} max={999999} value={s.startItemNumber}
            onChange={(e) => up('startItemNumber', Math.max(1, Math.min(999999, parseInt(e.target.value) || 1)))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
          <p className="text-[9px] text-gray-400 mt-1">Item numbers on the pictures start here (e.g. 1001, 1002…). Reps enter this number to open an item.</p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Crawling</h3>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Default pages to scan</label>
          <select value={s.crawlMode} onChange={(e) => up('crawlMode', e.target.value as CrawlMode)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
            {(Object.keys(CRAWL_LABELS) as CrawlMode[]).map((m) => <option key={m} value={m}>{CRAWL_LABELS[m]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Maximum pages</label>
          <input type="number" min={1} max={50} value={s.maxPages} onChange={(e) => up('maxPages', Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
        </div>
      </section>

      <section className="space-y-1.5">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Show in PDF</h3>
        {OPTS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={s[key] as boolean} onChange={(e) => up(key, e.target.checked as ST[typeof key])} className="w-3.5 h-3.5 accent-blue-600" />
            <span className="text-xs text-gray-700">{label}</span>
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Branding</h3>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Company name (PDF header)</label>
          <input type="text" value={s.companyName} onChange={(e) => up('companyName', e.target.value)} placeholder="Your Company" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-700 mb-1">Company logo</label>
          <div className="flex items-center gap-2">
            {s.companyLogo && <img src={s.companyLogo} alt="logo" className="w-9 h-9 object-contain border border-gray-200 rounded" />}
            <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} className="text-[10px] flex-1" />
            {s.companyLogo && <button onClick={() => up('companyLogo', undefined)} className="text-[10px] text-red-500 hover:text-red-700">Remove</button>}
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-1.5">
            <input type="checkbox" checked={s.showLogo} onChange={(e) => up('showLogo', e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
            <span className="text-[10px] text-gray-700">Show logo in PDF header</span>
          </label>
        </div>
        <p className="text-[9px] text-gray-400 leading-tight">Every catalog footer is permanently branded “Developed by CodeLab”.</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-gray-700 mb-1">Default customer</label>
            <input type="text" value={s.defaultCustomerName} onChange={(e) => up('defaultCustomerName', e.target.value)} placeholder="Optional" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-700 mb-1">Default rep</label>
            <input type="text" value={s.defaultRepresentative} onChange={(e) => up('defaultRepresentative', e.target.value)} placeholder="Optional" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        </div>
      </section>

      <div className="space-y-2 pt-2 border-t border-gray-200">
        <button onClick={save} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg">
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
        <button onClick={clear} className="w-full py-2 bg-white hover:bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg">
          🗑 Clear All History & Reset
        </button>
      </div>
    </div>
  );
};