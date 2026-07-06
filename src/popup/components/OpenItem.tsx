import React, { useState, useEffect } from 'react';
import { CatalogRecord } from '../../types';
import { storageManager } from '../../storage/StorageManager';

export const OpenItem: React.FC = () => {
  const [catalogId, setCatalogId] = useState('');
  const [num, setNum] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<CatalogRecord[]>([]);

  useEffect(() => { storageManager.getCatalogs().then((c) => setRecent(c.slice(0, 5))); }, []);

  const open = () => {
    const id = catalogId.trim();
    const n = parseInt(num.trim(), 10);
    if (!id) { setError('Please enter a Catalog ID.'); return; }
    if (!n || n < 1) { setError('Please enter a valid item number.'); return; }
    setLoading(true); setError(''); setStatus('');
    chrome.runtime.sendMessage({ type: 'OPEN_ITEM', payload: { catalogId: id, itemNumber: n } }, (resp) => {
      setLoading(false);
      if (chrome.runtime.lastError || !resp?.success) { setError(resp?.error ?? `Item #${n} not found in ${id}.`); }
      else { setStatus(`Opening Item #${n} — ${resp.data.title?.substring(0, 45) ?? ''}`); setTimeout(() => window.close(), 1200); }
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-800">Open Item</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">Enter the Catalog ID and item number printed on the catalog.</p>
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Catalog ID</label>
          <input value={catalogId} onChange={(e) => setCatalogId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && open()} placeholder="e.g. CAT-20260706-000123"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {recent.map((c) => (
                <button key={c.id} onClick={() => setCatalogId(c.id)}
                  className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">{c.id}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Item number</label>
          <input type="number" min={1} value={num} onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && open()} placeholder="e.g. 47"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button onClick={open} disabled={loading || !num || !catalogId}
          className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg">
          {loading ? '⏳ Looking up…' : '🔍 Open Product Page'}
        </button>
      </div>
      {status && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2"><p className="text-[10px] text-green-700">✓ {status}</p></div>}
      {error  && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2"><p className="text-[10px] text-red-700">⚠ {error}</p></div>}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-[10px] font-semibold text-blue-700">How it works:</p>
        <ol className="text-[10px] text-blue-600 list-decimal list-inside space-y-0.5 mt-1">
          <li>Each catalog has a unique Catalog ID (e.g. CAT-20260706-000123)</li>
          <li>Give the customer the Catalog ID + item numbers</li>
          <li>When they call back — type both here</li>
          <li>The exact product page opens instantly</li>
        </ol>
      </div>
    </div>
  );
};