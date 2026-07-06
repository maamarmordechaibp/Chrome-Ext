import React, { useState, useEffect } from 'react';
import { CatalogRecord } from '../../types';
import { storageManager } from '../../storage/StorageManager';

const MC: Record<string, string> = {
  Amazon:'bg-yellow-100 text-yellow-800', Walmart:'bg-blue-100 text-blue-800',
  eBay:'bg-red-100 text-red-800', AliExpress:'bg-orange-100 text-orange-800'
};
const fmt = (ts: number) => new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });

export const History: React.FC = () => {
  const [cats, setCats] = useState<CatalogRecord[]>([]);
  const [localPdfs, setLocalPdfs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const list = await storageManager.getCatalogs();
    setCats(list);
    const flags = await Promise.all(list.map((c) => storageManager.hasLocalPdf(c.id)));
    setLocalPdfs(new Set(list.filter((_, i) => flags[i]).map((c) => c.id)));
    setLoading(false);
  };
  const del = async (id: string) => { if (!confirm('Remove this catalog?')) return; await storageManager.deleteCatalog(id); await load(); };
  const fav = async (id: string) => { await storageManager.toggleFavorite(id); await load(); };

  const openPdf = async (id: string) => {
    const blob = await storageManager.getPdf(id);
    if (!blob) { alert('No stored PDF for this catalog.'); return; }
    window.open(URL.createObjectURL(blob), '_blank');
  };
  const downloadPdf = async (cat: CatalogRecord) => {
    const blob = await storageManager.getPdf(cat.id);
    if (!blob) { alert('No stored PDF for this catalog.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${cat.id}.pdf`; a.click(); URL.revokeObjectURL(a.href);
  };

  if (loading) return <div className="p-6 text-center text-[10px] text-gray-400">Loading…</div>;
  if (!cats.length) return (
    <div className="p-6 text-center space-y-2">
      <p className="text-3xl">📋</p>
      <p className="text-sm font-semibold text-gray-600">No catalogs yet</p>
      <p className="text-[10px] text-gray-400">Generated catalogs appear here for item lookup.</p>
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800">Catalog History</h2>
        <span className="text-[10px] text-gray-400">{cats.length} saved</span>
      </div>
      <div className="space-y-2">
        {cats.map((cat) => {
          const from = cat.itemMappings[0]?.itemNumber;
          const to   = cat.itemMappings[cat.itemMappings.length - 1]?.itemNumber;
          return (
            <div key={cat.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-start gap-2.5">
                {cat.thumbnail
                  ? <img src={cat.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" />
                  : <div className="w-11 h-11 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg shrink-0">🛒</div>}
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${MC[cat.marketplace] ?? 'bg-gray-100 text-gray-700'}`}>{cat.marketplace}</span>
                    <span className="text-[10px] text-gray-500">{cat.productCount} items</span>
                    {from !== undefined && <span className="text-[9px] text-gray-400">#{from} – #{to}</span>}
                  </div>
                  <p className="text-[9px] font-mono text-gray-500">{cat.id}</p>
                  <p className="text-[10px] font-medium text-gray-700 truncate">"{cat.searchKeywords || 'No keywords'}"</p>
                  {(cat.customerName || cat.representative) && (
                    <p className="text-[9px] text-gray-500 truncate">
                      {cat.customerName && <>👤 {cat.customerName}</>}
                      {cat.customerName && cat.representative && ' · '}
                      {cat.representative && <>🧑‍💼 {cat.representative}</>}
                    </p>
                  )}
                  <p className="text-[9px] text-gray-400">{fmt(cat.generationDate)}</p>
                </div>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <button onClick={() => fav(cat.id)} title="Favorite" className={`text-[13px] ${cat.favorite ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}>★</button>
                  <button onClick={() => del(cat.id)} title="Delete" className="text-[11px] text-gray-400 hover:text-red-500">🗑</button>
                </div>
              </div>
              {cat.hasPdf && (localPdfs.has(cat.id) ? (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
                  <button onClick={() => openPdf(cat.id)} className="flex-1 text-[10px] py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-600">👁 Preview</button>
                  <button onClick={() => downloadPdf(cat)} className="flex-1 text-[10px] py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-600">⬇️ Download</button>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[9px] text-gray-400">📄 PDF was generated on another computer. Use <span className="font-semibold">Open Item</span> to view its products.</p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};