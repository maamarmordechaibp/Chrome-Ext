import React, { useState, useEffect } from 'react';
import { CatalogRecord } from '../../types';
import { storageManager } from '../../storage/StorageManager';
import { logUsage } from '../../cloud/faxService';
import { getCatalogPdfBlob } from '../resend';
import { SendButtons } from './SendButtons';

const MARKET_DOMAIN: Record<string, string> = {
  Amazon: 'https://www.amazon.com',
  Walmart: 'https://www.walmart.com',
  eBay: 'https://www.ebay.com',
  AliExpress: 'https://www.aliexpress.com',
  Target: 'https://www.target.com',
  "Macy's": 'https://www.macys.com',
  Costco: 'https://www.costco.com',
  'Home Depot': 'https://www.homedepot.com',
  'Best Buy': 'https://www.bestbuy.com',
  "Lowe's": 'https://www.lowes.com',
  Wayfair: 'https://www.wayfair.com',
  Etsy: 'https://www.etsy.com',
  "Kohl's": 'https://www.kohls.com',
  JCPenney: 'https://www.jcpenney.com',
  Nordstrom: 'https://www.nordstrom.com',
  'Nordstrom Rack': 'https://www.nordstromrack.com',
  "BJ's": 'https://www.bjs.com',
  "Sam's Club": 'https://www.samsclub.com',
  Newegg: 'https://www.newegg.com',
  'Bed Bath & Beyond': 'https://www.bedbathandbeyond.com',
  'Old Navy': 'https://oldnavy.gap.com',
  Gap: 'https://www.gap.com',
  'Banana Republic': 'https://bananarepublic.gap.com',
  'H&M': 'https://www2.hm.com',
  Zara: 'https://www.zara.com',
  ASOS: 'https://www.asos.com',
  DSW: 'https://www.dsw.com',
  'Foot Locker': 'https://www.footlocker.com',
  "Dick's": 'https://www.dickssportinggoods.com',
  IKEA: 'https://www.ikea.com',
  Ashley: 'https://www.ashleyfurniture.com',
  'Pottery Barn': 'https://www.potterybarn.com',
  'Crate & Barrel': 'https://www.crateandbarrel.com',
  'Container Store': 'https://www.containerstore.com',
  'Williams Sonoma': 'https://www.williams-sonoma.com',
  'B&H Photo': 'https://www.bhphotovideo.com',
  'Micro Center': 'https://www.microcenter.com',
  Dell: 'https://www.dell.com',
  HP: 'https://www.hp.com',
  Lenovo: 'https://www.lenovo.com',
};

/** Turns a stored product link into an absolute http(s) URL so it never opens
 *  as an extension-relative path (which shows Chrome's "file not found"). */
function toAbsoluteUrl(raw: string | undefined, marketplace: string): string {
  const s = (raw ?? '').trim();
  if (!s || /^(javascript:|#|mailto:|data:)/i.test(s)) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const base = MARKET_DOMAIN[marketplace];
  if (base) return `${base}/${s.replace(/^\/+/, '')}`;
  return `https://${s.replace(/^\/+/, '')}`;
}

export const OpenItem: React.FC = () => {
  const [num, setNum] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<CatalogRecord[]>([]);
  const [resendId, setResendId] = useState('');

  useEffect(() => { storageManager.getCatalogs().then((c) => setRecent(c.slice(0, 5))); }, []);

  const open = () => {
    const n = parseInt(num.trim(), 10);
    if (!n || n < 1) { setError('Please enter a valid item number.'); return; }
    setLoading(true); setError(''); setStatus('');
    // Item numbers are globally unique, so the number alone finds the product
    // across every catalog the team has made.
    storageManager.findItemByNumber(n)
      .then((hit) => {
        if (!hit) { setError(`Item #${n} was not found.`); return; }
        const url = toAbsoluteUrl(hit.mapping.url, hit.mapping.marketplace);
        if (!url) {
          setError(`Item #${n} ("${hit.mapping.title?.substring(0, 40) ?? ''}") has no saved product link.`);
          return;
        }
        void logUsage('lookups');
        chrome.tabs.create({ url, active: true });
        setStatus(`Opening Item #${n} — ${hit.mapping.title?.substring(0, 45) ?? ''}`);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-800">Open Item</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">Enter just the item number printed next to the product.</p>
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Item number</label>
          <input type="number" min={1} value={num} onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && open()} placeholder="e.g. 1047"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button onClick={open} disabled={loading || !num}
          className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg">
          {loading ? '⏳ Looking up…' : '🔍 Open Product Page'}
        </button>
      </div>
      {status && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2"><p className="text-[10px] text-green-700">✓ {status}</p></div>}
      {error  && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2"><p className="text-[10px] text-red-700">⚠ {error}</p></div>}

      <div className="border-t border-gray-200 pt-3 space-y-2">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Resend a catalog</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">Customer didn’t get the full catalog? Enter its Catalog ID to fax or email it again.</p>
        </div>
        <input value={resendId} onChange={(e) => setResendId(e.target.value)}
          placeholder="e.g. CAT-20260706-000123"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        {recent.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recent.map((c) => (
              <button key={c.id} onClick={() => setResendId(c.id)}
                className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">{c.id}</button>
            ))}
          </div>
        )}
        {resendId.trim() && (
          <SendButtons getBlob={() => getCatalogPdfBlob(resendId)} filenameBase={resendId.trim()} />
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-[10px] font-semibold text-blue-700">How it works:</p>
        <ol className="text-[10px] text-blue-600 list-decimal list-inside space-y-0.5 mt-1">
          <li>Give the customer the item numbers from the catalog</li>
          <li>When they call back — type the item number here</li>
          <li>The exact product page opens instantly</li>
          <li>To resend a whole catalog, use its Catalog ID above</li>
        </ol>
      </div>
    </div>
  );
};