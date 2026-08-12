// Lets a rep queue a background job that searches similar items across other
// marketplaces and auto-sends the finished catalog. The work runs in the
// service worker (see jobRunner) so it continues after the popup closes.
import React, { useState } from 'react';
import { CrawlMode, JobSourceItem, Marketplace } from '../../types';
import { SEARCHABLE_MARKETPLACES } from '../../parsers/searchUrl';
import { storageManager } from '../../storage/StorageManager';

interface Props {
  keywords: string;
  sourceItems: JobSourceItem[];
  sourceCatalogId?: string;
  crawlMode: CrawlMode;
  maxPages: number;
  customerName?: string;
  representative?: string;
}

export const BackgroundJobForm: React.FC<Props> = ({
  keywords, sourceItems, sourceCatalogId, crawlMode, maxPages,
}) => {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Set<Marketplace>>(new Set());
  const [email, setEmail] = useState('');
  const [fax, setFax] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const toggle = (mp: Marketplace) =>
    setTargets((prev) => { const n = new Set(prev); n.has(mp) ? n.delete(mp) : n.add(mp); return n; });

  const queue = async () => {
    setMsg(''); setErr('');
    if (!keywords.trim()) { setErr('This catalog has no search keywords to reuse.'); return; }
    if (targets.size === 0) { setErr('Pick at least one website to search.'); return; }
    if (!email.trim() && !fax.trim()) { setErr('Enter an email or fax to send the finished catalog to.'); return; }
    try {
      await storageManager.createJob({
        keywords: keywords.trim(),
        targetMarketplaces: [...targets],
        mode: crawlMode, maxPages,
        matchMode: 'both',
        sourceItems,
        sourceCatalogId,
        destinations: { email: email.trim() || undefined, fax: fax.trim() || undefined },
      });
      chrome.runtime.sendMessage({ type: 'RUN_JOBS' });
      setMsg('Queued. It will search in the background and send when done — see the Jobs tab.');
      setTargets(new Set()); setEmail(''); setFax('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-2.5 space-y-2">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[11px] font-semibold text-amber-800">
        <span>🔎 Find similar on other sites & send</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <p className="text-[9px] text-amber-700">
            Runs in the background across the websites you pick, then emails/faxes the catalog automatically.
          </p>
          <div>
            <span className="text-[10px] font-medium text-gray-600">Websites to search</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {SEARCHABLE_MARKETPLACES.map((mp) => (
                <button key={mp} onClick={() => toggle(mp)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full border ${targets.has(mp)
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'}`}>
                  {mp}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Send to email (optional)"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px]" />
            <input value={fax} onChange={(e) => setFax(e.target.value)} placeholder="Send to fax e.g. +15555550123 (optional)"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px]" />
          </div>
          <button onClick={queue}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold rounded-lg">
            ⏱️ Queue background job
          </button>
          {msg && <p className="text-[9px] text-green-700">✓ {msg}</p>}
          {err && <p className="text-[9px] text-red-600">⚠ {err}</p>}
        </div>
      )}
    </div>
  );
};
