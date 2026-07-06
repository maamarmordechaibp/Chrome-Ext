import React, { useState, useEffect, useCallback } from 'react';
import { PageInfo, Product, Settings, CatalogRecord, ItemMapping, CatalogMeta, CrawlMode } from '../../types';
import { storageManager } from '../../storage/StorageManager';
import { pdfGenerator }   from '../../pdf/PDFGenerator';
import { crawl }          from '../crawler';
import { captureDetail }  from '../detailCapture';
import { makeThumbnail, redactPeople }  from '../imageUtil';
import { ProductList }    from './ProductList';

async function getTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');
  return tab.id;
}

const CRAWL_LABELS: Record<CrawlMode, string> = {
  current: 'Current page only',
  first: 'First N pages',
  all: 'All pages (up to max)',
};

export const Dashboard: React.FC = () => {
  const [pageInfo,  setPageInfo]  = useState<PageInfo | null>(null);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [included,  setIncluded]  = useState<Set<string>>(new Set());
  const [settings,  setSettings]  = useState<Settings | null>(null);
  const [customer,  setCustomer]  = useState('');
  const [rep,       setRep]       = useState('');
  const [crawlMode, setCrawlMode] = useState<CrawlMode>('current');
  const [maxPages,  setMaxPages]  = useState(5);
  const [catalogId, setCatalogId] = useState('');
  const [status,    setStatus]    = useState('');
  const [error,     setError]     = useState('');
  const [progress,  setProgress]  = useState(0);
  const [phase, setPhase] = useState<'idle'|'scanning'|'images'|'pdf'|'done'>('idle');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  useEffect(() => {
    storageManager.getSettings().then((s) => {
      setSettings(s); setCustomer(s.defaultCustomerName); setRep(s.defaultRepresentative);
      setCrawlMode(s.crawlMode); setMaxPages(s.maxPages);
    });
    refresh();
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const tabId = await getTabId();
      chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_INFO' }, (resp) => {
        if (chrome.runtime.lastError) { setError('Refresh the marketplace page and try again.'); return; }
        if (resp?.success) setPageInfo(resp.data);
      });
    } catch { setError('Could not connect to the page.'); }
  }, []);

  const scan = useCallback(async () => {
    setPhase('scanning'); setError(''); setProducts([]); setIncluded(new Set());
    setPdfBlob(null); setCatalogId(''); setProgress(5); setStatus('Scanning…');
    try {
      const tabId = await getTabId();
      const result = await crawl(tabId, { mode: crawlMode, maxPages }, (p) => {
        setStatus(p.message);
        setProgress(Math.min(95, Math.round((p.page / p.totalPages) * 90) + 5));
      });
      setProducts(result.products);
      setIncluded(new Set(result.products.map((p) => p.id)));
      setPageInfo(result.pageInfo);
      setProgress(100); setPhase('done');
      setStatus(`Found ${result.products.length} products across ${result.pagesScanned} page(s)`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase('idle'); setStatus(''); }
  }, [crawlMode, maxPages]);

  const toggle = useCallback((id: string) => {
    setIncluded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleAll = useCallback((include: boolean) => {
    setIncluded(include ? new Set(products.map((p) => p.id)) : new Set());
  }, [products]);

  const generatePDF = useCallback(async () => {
    if (!settings || !pageInfo) return;
    const selected = products.filter((p) => included.has(p.id)).map((p, i) => ({ ...p, itemNumber: i + 1 }));
    if (!selected.length) { setError('Select at least one product.'); return; }
    setPhase('images'); setProgress(5); setError(''); setPdfBlob(null); setStatus('Fetching images…');
    try {
      const images = await new Promise<string[]>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGES_BATCH', payload: { urls: selected.map((p) => p.imageUrl) } }, (resp) => {
          if (chrome.runtime.lastError || !resp?.success) reject(new Error(resp?.error ?? 'Image fetch failed'));
          else resolve(resp.data as string[]);
        });
      });
      const enriched = selected.map((p, i) => ({ ...p, imageBase64: images[i] ?? undefined }));
      if (settings.hidePeople) {
        setStatus('Reviewing images…');
        for (const p of enriched) {
          if (p.imageBase64) p.imageBase64 = await redactPeople(p.imageBase64);
        }
      }
      setProgress(50); setPhase('pdf'); setStatus('Generating PDF…');
      const id = await storageManager.nextCatalogId();
      const meta: CatalogMeta = {
        catalogId: id, marketplace: pageInfo.marketplace, searchKeywords: pageInfo.searchKeywords,
        timestamp: Date.now(), companyName: settings.companyName,
        companyLogo: settings.companyLogo, showLogo: settings.showLogo,
        customerName: customer.trim() || undefined, representative: rep.trim() || undefined,
      };
      const blob = await pdfGenerator.generate(enriched, settings, meta);
      const thumb = await makeThumbnail(enriched.find((p) => p.imageBase64)?.imageBase64 ?? '');
      const maps: ItemMapping[] = enriched.map((p) => ({ itemNumber: p.itemNumber, url: p.url, page: p.page, marketplace: p.marketplace, timestamp: p.timestamp, title: p.title, imageUrl: p.imageUrl }));
      const rec: CatalogRecord = {
        id, marketplace: pageInfo.marketplace, searchKeywords: pageInfo.searchKeywords,
        generationDate: Date.now(), productCount: enriched.length, pageCount: pageInfo.totalPages ?? 1,
        customerName: meta.customerName, representative: meta.representative,
        thumbnail: thumb, favorite: false, hasPdf: true, itemMappings: maps,
      };
      await storageManager.saveCatalog(rec);
      await storageManager.savePdf(id, blob);
      setPdfBlob(blob); setCatalogId(id); setProgress(100); setPhase('done');
      setStatus(`Catalog ${id} ready — ${enriched.length} products`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase('idle'); setStatus(''); }
  }, [products, included, settings, pageInfo, customer, rep]);

  const download = useCallback(() => {
    if (!pdfBlob) return;
    const kw = (pageInfo?.searchKeywords ?? 'catalog').replace(/[^a-z0-9]/gi, '_').substring(0, 25);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(pdfBlob);
    a.download = `${catalogId || pageInfo?.marketplace}_${kw}.pdf`;
    a.click(); URL.revokeObjectURL(a.href);
  }, [pdfBlob, pageInfo, catalogId]);

  const captureProduct = useCallback(async () => {
    if (!settings) return;
    setPhase('images'); setProgress(5); setError(''); setPdfBlob(null); setStatus('Reading product…');
    try {
      const tabId = await getTabId();
      const { blob, catalogId: id } = await captureDetail(
        tabId, settings, { customerName: customer, representative: rep },
        (pct, msg) => { setProgress(pct); setStatus(msg); },
      );
      setPdfBlob(blob); setCatalogId(id); setProgress(100); setPhase('done');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase('idle'); setStatus(''); }
  }, [settings, customer, rep]);

  const isDetail = pageInfo?.pageType === 'detail';
  const sup = pageInfo?.isSupported ?? false;
  const busy = phase === 'scanning' || phase === 'images' || phase === 'pdf';
  const selectedCount = products.filter((p) => included.has(p.id)).length;

  return (
    <div className="p-4 space-y-3">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sup ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            {sup ? `✓ ${pageInfo!.marketplace}${isDetail ? ' · Product page' : ''}` : '⚠ Not a supported page'}
          </span>
          <button onClick={refresh} disabled={busy} className="text-[10px] text-blue-500 hover:text-blue-700 disabled:opacity-40">↻ Refresh</button>
        </div>
        {sup && pageInfo && isDetail && (
          <p className="text-[10px] text-gray-600">Capture this product's full details — every image, size, price and spec — into a printable product sheet.</p>
        )}
        {sup && pageInfo && !isDetail && (
          <div className="grid grid-cols-2 gap-x-3 text-[10px] text-gray-600">
            <span><b>Search:</b> {pageInfo.searchKeywords || '(none)'}</span>
            <span><b>Page:</b> {pageInfo.currentPage}{pageInfo.totalPages ? ` / ${pageInfo.totalPages}` : ''}</span>
            {products.length > 0 && <span><b>Found:</b> {products.length} products</span>}
          </div>
        )}
        {!pageInfo && <p className="text-[10px] text-gray-400">Connecting…</p>}
        {!sup && pageInfo && <p className="text-[10px] text-gray-500">Navigate to a search results or product page on Amazon, eBay, Walmart, or AliExpress.</p>}
      </div>

      {sup && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-medium text-gray-600">Customer</span>
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium text-gray-600">Representative</span>
              <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Your name"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
          </div>

          {isDetail ? (
            <div className="space-y-2">
              <button onClick={captureProduct} disabled={busy} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg transition-colors">
                {busy ? '⏳ Capturing…' : '📸 Capture this product'}
              </button>
              {pdfBlob && (
                <button onClick={download} className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg">⬇️ Download product sheet</button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-medium text-gray-600">Pages to scan</span>
                  <select value={crawlMode} onChange={(e) => setCrawlMode(e.target.value as CrawlMode)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px]">
                    {(Object.keys(CRAWL_LABELS) as CrawlMode[]).map((m) => <option key={m} value={m}>{CRAWL_LABELS[m]}</option>)}
                  </select>
                </label>
                <label className={`block ${crawlMode === 'current' ? 'opacity-40 pointer-events-none' : ''}`}>
                  <span className="text-[10px] font-medium text-gray-600">Max pages</span>
                  <input type="number" min={1} max={50} value={maxPages} onChange={(e) => setMaxPages(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px]" />
                </label>
              </div>

              <div className="space-y-2">
                <button onClick={scan} disabled={busy} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg transition-colors">
                  {phase === 'scanning' ? '⏳ Scanning…' : '🔍 Scan Products'}
                </button>
                {products.length > 0 && (
                  <button onClick={generatePDF} disabled={busy || selectedCount === 0} className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-xs font-semibold rounded-lg transition-colors">
                    {busy && phase !== 'scanning' ? '⏳ Generating…' : `📄 Generate PDF (${selectedCount} items)`}
                  </button>
                )}
                {pdfBlob && (
                  <button onClick={download} className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg">⬇️ Download PDF</button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {busy && (
        <div className="space-y-1">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-gray-500 text-center">{status}</p>
        </div>
      )}
      {status && !busy && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2"><p className="text-[10px] text-green-700">✓ {status}</p></div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2"><p className="text-[10px] text-red-700">⚠ {error}</p></div>}

      {products.length > 0 && !busy && (
        <ProductList products={products} included={included} onToggle={toggle} onToggleAll={toggleAll} />
      )}
    </div>
  );
};