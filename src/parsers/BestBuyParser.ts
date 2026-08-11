import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /site/<slug>/<sku>.p. Search links share the /site/ prefix. */
const PRODUCT_LINK = 'a[href*="/site/"]';

export class BestBuyParser extends BaseParser {
  readonly marketplace: Marketplace = 'Best Buy';
  readonly hostPattern = /bestbuy\.com/;
  protected readonly pageParam = 'cp';

  isDetailPage(doc: Document): boolean {
    return /\/site\/.+\.p/.test(doc.location?.pathname ?? '') || !!doc.querySelector('.sku-title h1, [data-testid="product-title"]');
  }

  private key(href: string): string {
    const path = (href || '').split('?')[0];
    return path.match(/\/(\d{6,})\.p/)?.[1] ?? path.replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['.sku-title h1', '[data-testid="product-title"]', 'h1']));
    if (!title || title.length < 3) return null;
    const brand = this.getText(this.firstOf(doc, ['.brand-container a', 'a[href*="/brand/"]'])).substring(0, 60) || undefined;
    const price = this.priceFrom(this.firstOf(doc, ['[data-testid="customer-price"]', '.priceView-customer-price span', '.pricing-price [class*="price"]']));
    const originalPrice = this.priceFrom(this.firstOf(doc, ['.pricing-price__regular-price', '[data-testid="regular-price"]'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['.ugc-c-review-average', '[itemprop="ratingValue"]'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['.c-reviews-v4', '[itemprop="reviewCount"]', '.ugc-review-count']));
    const description = this.getText(this.firstOf(doc, ['.product-description', '[data-testid="overview"]'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('.feature-list li, [data-testid="highlights"] li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const specs = this.collectSpecs(this.allOf(doc, ['.specs-table tr', '[data-testid="specifications"] .row', '.spec-table tr']));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('.primary-image, .thumbnail-image img, [data-testid="gallery"] img')),
      (u) => u.split(';')[0],
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, description,
      images, features, specs, variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('st') || params.get('keyword') || '';
    const currentPage = parseInt(params.get('cp') || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['.sku-item', '[data-testid="product-list-item"]', 'li.product-list-item']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = this.firstOf(container, ['.sku-title a', PRODUCT_LINK]) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.bestbuy.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['.sku-title', '[data-testid="product-title"]', 'h4', 'h3']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickTileImage(container);
        const price = this.priceFrom(container, ['[data-testid="customer-price"]', '.priceView-customer-price span', '[class*="price"]']);
        const ratingEl = container.querySelector('.c-ratings-reviews, [class*="rating"]');
        const rating = ratingEl ? this.getText(ratingEl).match(/[\d.]+/)?.[0] : undefined;
        const reviewEl = container.querySelector('.c-reviews, .c-total-reviews');
        const reviews = reviewEl ? this.countText(reviewEl) : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, rating, reviews, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
