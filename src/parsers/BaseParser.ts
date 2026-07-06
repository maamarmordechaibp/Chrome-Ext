import { Product, PageInfo, ExtractResult, Marketplace, NextPageInfo, ProductDetail, PageType, SpecRow } from '../types';

export abstract class BaseParser {
  abstract readonly marketplace: Marketplace;
  abstract readonly hostPattern: RegExp;
  /** URL query parameter used for pagination on this marketplace. */
  protected abstract readonly pageParam: string;
  matches(url: string): boolean { return this.hostPattern.test(url); }
  protected getText(el: Element | null | undefined): string {
    if (!el) return '';
    // Ignore style/script content that would otherwise leak CSS/JS into the text.
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('style, script, noscript').forEach((n) => n.remove());
    return this.clean(clone.textContent ?? '');
  }
  /** Normalises whitespace and drops obvious non-product junk (CSS/markup fragments). */
  protected clean(raw: string): string {
    let t = (raw ?? '').replace(/\s+/g, ' ').trim();
    // Strip CSS custom properties / declarations that sometimes leak from inline styles.
    t = t.replace(/--?[a-z-]+\s*:\s*[^;]+;?/gi, '')
         .replace(/#[0-9a-f]{3,8}\b/gi, '')
         .replace(/\{[^}]*\}/g, '')
         .replace(/\s+/g, ' ')
         .trim();
    // Reject strings that are clearly not human-readable product copy.
    if (/color\s*:|rgba?\(|font-|Join Prime|ad feedback|sponsored/i.test(t)) return '';
    return t;
  }
  /** Returns a clean numeric-count string (e.g. "1,234") or undefined. */
  protected countText(el: Element | null | undefined): string | undefined {
    const t = this.getText(el).replace(/[^\d,]/g, '');
    return /\d/.test(t) ? t : undefined;
  }
  protected getAttr(el: Element | null | undefined, attr: string): string {
    return el?.getAttribute(attr)?.trim() ?? '';
  }
  protected firstOf(doc: Document | Element, selectors: string[]): Element | null {
    for (const sel of selectors) { const el = doc.querySelector(sel); if (el) return el; }
    return null;
  }
  protected allOf(doc: Document | Element, selectors: string[]): Element[] {
    for (const sel of selectors) {
      const els = Array.from(doc.querySelectorAll(sel));
      if (els.length > 0) return els;
    }
    return [];
  }
  protected absoluteUrl(href: string, base: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    try { return new URL(href, base).href; } catch { return href; }
  }
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  abstract extractPageInfo(doc: Document): PageInfo;
  abstract extractProducts(doc: Document, sq: string, page: number, start: number): Product[];

  /**
   * True when the current document is a single-product detail page (not a results list).
   * Subclasses override with marketplace-specific detection; defaults to false.
   */
  isDetailPage(_doc: Document): boolean { return false; }

  /** Classifies the page so the popup can offer the right action. */
  getPageType(doc: Document): PageType {
    if (this.isDetailPage(doc)) return 'detail';
    return 'search';
  }

  /**
   * Extracts rich data from a single-product detail page. Subclasses override;
   * the default returns null so unsupported pages fail gracefully.
   */
  extractDetail(_doc: Document): ProductDetail | null { return null; }

  /** Collects distinct, non-placeholder image URLs from a set of <img> elements. */
  protected collectImages(imgs: Element[], upgrade?: (u: string) => string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const el of imgs) {
      const raw = (el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-old-hires') || '').trim();
      if (!raw || raw.startsWith('data:')) continue;
      const url = upgrade ? upgrade(raw) : raw;
      const key = url.replace(/^https?:/, '');
      if (seen.has(key)) continue;
      seen.add(key); out.push(url);
    }
    return out;
  }

  /** Reads a two-column spec table (th/td or dt/dd pairs) into label/value rows. */
  protected collectSpecs(rows: Element[]): SpecRow[] {
    const out: SpecRow[] = [];
    for (const row of rows) {
      const label = this.getText(row.querySelector('th, dt, .label, [class*="label"], td:first-child'));
      const value = this.getText(row.querySelector('td:last-child, dd, .value, [class*="value"]'));
      if (label && value && label !== value && out.length < 40) out.push({ label: label.substring(0, 50), value: value.substring(0, 120) });
    }
    return out;
  }

  /** Builds the URL of the next results page, or null when on the last page. */
  getNextPage(doc: Document): NextPageInfo {
    const info = this.extractPageInfo(doc);
    if (info.totalPages && info.currentPage >= info.totalPages) {
      return { url: null, currentPage: info.currentPage, totalPages: info.totalPages };
    }
    let url: string | null = null;
    try {
      const u = new URL(doc.location?.href ?? '');
      u.searchParams.set(this.pageParam, String(info.currentPage + 1));
      url = u.href;
    } catch { url = null; }
    return { url, currentPage: info.currentPage, totalPages: info.totalPages };
  }

  /** Extracts products starting from a given item number (used while crawling). */
  extractFrom(doc: Document, start: number): ExtractResult {
    try {
      const pageInfo = this.extractPageInfo(doc);
      const products = this.extractProducts(doc, pageInfo.searchKeywords, pageInfo.currentPage, start);
      return { success: true, products, pageInfo };
    } catch (err) {
      return { success: false, products: [],
        pageInfo: { marketplace: this.marketplace, searchKeywords: '', currentPage: 1, isSupported: false, url: doc.location?.href ?? '' },
        error: err instanceof Error ? err.message : 'Parser error' };
    }
  }

  extract(doc: Document): ExtractResult { return this.extractFrom(doc, 1); }
}