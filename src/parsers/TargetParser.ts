import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /p/<slug>/-/A-<tcin>. Search links share the /p/ prefix. */
const PRODUCT_LINK = 'a[href*="/p/"]';

export class TargetParser extends BaseParser {
  readonly marketplace: Marketplace = 'Target';
  readonly hostPattern = /target\.com/;
  protected readonly pageParam = 'Nao';

  isDetailPage(doc: Document): boolean {
    return /\/p\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('h1[data-test="product-title"]');
  }

  /** Distinct products key off the "A-<tcin>" segment when present. */
  private key(href: string): string {
    const path = (href || '').split('?')[0];
    return path.match(/\/A-(\d+)/)?.[1] ?? path.replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['h1[data-test="product-title"]', 'h1[itemprop="name"]', 'h1']));
    if (!title || title.length < 3) return null;
    const brand = this.getText(this.firstOf(doc, ['[data-test="product-brand"]', 'a[href*="/b/"]'])).substring(0, 60) || undefined;
    const price = this.priceFrom(this.firstOf(doc, ['[data-test="product-price"]', '[itemprop="price"]', '[class*="Price"]']));
    const originalPrice = this.priceFrom(this.firstOf(doc, ['[data-test="product-regular-price"]', '.h-text-line-through'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['[data-test="ratings"]', '[class*="RatingsText"]'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['[data-test="rating-count"]', '[class*="ReviewsCount"]']));
    const description = this.getText(this.firstOf(doc, ['[data-test="item-details-description"]', '#drawer-description'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('[data-test="item-details-highlights"] li, [data-test="itemDetails"] li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const specs = this.collectSpecs(this.allOf(doc, ['[data-test="item-details-specifications"] div', '.styles__StyledCol-sc tr']));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('[data-test="image-gallery-item"] img, picture img, [class*="ZoomableImage"] img')),
      (u) => u.split('?')[0],
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, description,
      images, features, specs, variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('searchTerm') || params.get('keyword') || '';
    const offset = parseInt(params.get('Nao') || '0', 10) || 0;
    const currentPage = Math.floor(offset / 24) + 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['[data-test="@web/site-top-of-funnel/ProductCardWrapper"]', '[data-test="product-card"]']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(PRODUCT_LINK) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.target.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['[data-test="product-title"]', 'a[href*="/p/"] div', 'h3', 'h2']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickImage(container);
        const price = this.priceFrom(container, ['[data-test="current-price"]', '[data-test="product-price"]', '[class*="Price"]']);
        const brandEl = this.firstOf(container, ['[data-test="product-brand"]', 'a[href*="/b/"]']);
        const brand = brandEl ? this.getText(brandEl).substring(0, 40) : undefined;
        const ratingEl = container.querySelector('[data-test="ratings"], [class*="Rating"]');
        const rating = ratingEl ? this.getText(ratingEl).match(/[\d.]+/)?.[0] : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, brand, rating, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
