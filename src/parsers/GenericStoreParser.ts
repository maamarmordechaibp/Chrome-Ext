import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Declarative description of a marketplace, consumed by {@link GenericStoreParser}.
 *  Only `marketplace`, `hostPattern`, `base`, `detailPath` and `linkSelector` are
 *  required; everything else falls back to robust generic defaults. */
export interface StoreConfig {
  marketplace: Marketplace;
  hostPattern: RegExp;
  /** Absolute origin used to resolve relative product links. */
  base: string;
  /** Path pattern identifying a single-product (detail) page. */
  detailPath: RegExp;
  /** Anchor selector whose matches point at products (drives tile discovery). */
  linkSelector: string;
  /** URL query param used for pagination. Defaults to `page`. */
  pageParam?: string;
  /** Query params that may hold the search keyword. */
  keywordParams?: string[];
  /** Captures a stable product id from an href (group 1) so a tile's image and
   *  title links collapse to one product. Defaults to the path. */
  keyRegex?: RegExp;
  /** Fallback tile-container selectors when link discovery finds nothing. */
  tileSelectors?: string[];
  titleSelectors?: string[];
  priceSelectors?: string[];
  brandSelectors?: string[];
  detailTitleSelectors?: string[];
  imageUpgrade?: (u: string) => string;
}

const DEFAULT_TITLE = ['h3', 'h2', '[class*="title" i]', '[class*="name" i]'];
const DEFAULT_PRICE = ['[data-testid*="price" i]', '[class*="price" i]', '[itemprop="price"]'];
const DEFAULT_KEYWORDS = ['q', 'query', 'keyword', 'keywords', 'searchTerm', 'search', 'text'];

/** One parser that adapts to many marketplaces via a {@link StoreConfig}. It
 *  leans on BaseParser's redesign-proof link discovery and currency parsing, so
 *  a store only needs a link pattern plus optional selector hints. */
export class GenericStoreParser extends BaseParser {
  readonly marketplace: Marketplace;
  readonly hostPattern: RegExp;
  protected readonly pageParam: string;
  private readonly cfg: StoreConfig;

  constructor(cfg: StoreConfig) {
    super();
    this.cfg = cfg;
    this.marketplace = cfg.marketplace;
    this.hostPattern = cfg.hostPattern;
    this.pageParam = cfg.pageParam ?? 'page';
  }

  isDetailPage(doc: Document): boolean {
    const path = doc.location?.pathname ?? '';
    if (this.cfg.detailPath.test(path)) return true;
    return (this.cfg.detailTitleSelectors ?? []).some((s) => !!doc.querySelector(s));
  }

  private key(href: string): string {
    const path = (href || '').split('?')[0];
    if (this.cfg.keyRegex) return path.match(this.cfg.keyRegex)?.[1] ?? path.replace(/\/$/, '');
    return path.replace(/\/$/, '');
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    let searchKeywords = '';
    for (const p of this.cfg.keywordParams ?? DEFAULT_KEYWORDS) {
      const v = params.get(p); if (v) { searchKeywords = v; break; }
    }
    const currentPage = parseInt(params.get(this.pageParam) || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, this.cfg.detailTitleSelectors ?? ['h1[itemprop="name"]', 'h1']));
    if (!title || title.length < 3) return null;
    const brand = this.cfg.brandSelectors
      ? this.getText(this.firstOf(doc, this.cfg.brandSelectors)).substring(0, 60) || undefined
      : undefined;
    const price = this.priceFrom(this.firstOf(doc, this.cfg.priceSelectors ?? DEFAULT_PRICE));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('[class*="gallery" i] img, [class*="carousel" i] img, [class*="media" i] img, picture img')),
      this.cfg.imageUpgrade,
    ).slice(0, 8);
    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, images, features: [], specs: [], variants: [], timestamp: Date.now(),
    };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, this.cfg.linkSelector, (h) => this.key(h));
    const containers = tiles.length
      ? tiles
      : this.allOf(doc, this.cfg.tileSelectors ?? ['[class*="product-tile" i]', '[class*="product-card" i]', '[class*="product" i]', 'article', 'li']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(this.cfg.linkSelector) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), this.cfg.base);
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, this.cfg.titleSelectors ?? DEFAULT_TITLE);
        const title = this.getText(titleEl)
          || this.getAttr(linkEl, 'aria-label') || this.getAttr(linkEl, 'title')
          || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickImage(container);
        const price = this.priceFrom(container, this.cfg.priceSelectors ?? DEFAULT_PRICE);
        const brandEl = this.cfg.brandSelectors ? this.firstOf(container, this.cfg.brandSelectors) : null;
        const brand = brandEl ? this.getText(brandEl).substring(0, 40) : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, brand, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
