import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /<category>/pdp/<slug>-<sku>.html. */
const PRODUCT_LINK = 'a[href*="/pdp/"]';

export class WayfairParser extends BaseParser {
  readonly marketplace: Marketplace = 'Wayfair';
  readonly hostPattern = /wayfair\.com/;
  protected readonly pageParam = 'curpage';

  isDetailPage(doc: Document): boolean {
    return /\/pdp\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('[data-testid="productTitle"], h1.pl-Heading');
  }

  private key(href: string): string {
    const path = (href || '').split('?')[0];
    return path.match(/-([a-z0-9]+)\.html/i)?.[1] ?? path.replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['[data-testid="productTitle"]', 'h1.pl-Heading', 'h1']));
    if (!title || title.length < 3) return null;
    const brand = this.getText(this.firstOf(doc, ['[data-testid="productBrand"]', 'a[href*="/brand/"]'])).substring(0, 60) || undefined;
    const price = this.priceFrom(this.firstOf(doc, ['[data-testid="PriceDisplay"]', '.SFPrice', '[class*="Price"]']));
    const originalPrice = this.priceFrom(this.firstOf(doc, ['[data-testid="listPrice"]', '.StrikethroughPrice'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['[data-testid="review-rating"]', '.ReviewStars'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['[data-testid="review-count"]', '.ReviewCount']));
    const description = this.getText(this.firstOf(doc, ['[data-testid="product-overview"]', '.ProductOverviewInformation'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('[data-testid="product-highlights"] li, .ProductWeightsDimensions li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const specs = this.collectSpecs(this.allOf(doc, ['.Specifications tr', '[data-testid="specifications"] tr']));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('[data-testid="ImageComponent"] img, .ProductDetailImageCarousel img, .pl-Image')),
      (u) => u.replace(/\?.*$/, ''),
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, description,
      images, features, specs, variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('keyword') || params.get('query') || '';
    const currentPage = parseInt(params.get('curpage') || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['[data-testid="ProductCard"]', '.ProductCard', '[data-hb-id="ProductCard"]']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(PRODUCT_LINK) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.wayfair.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['[data-testid="ProductCard-name"]', '.ProductCard-name', 'h3', 'h2']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickImage(container);
        const price = this.priceFrom(container, ['[data-testid="PriceDisplay"]', '.SFPrice', '[class*="Price"]']);
        const originalPrice = this.priceFrom(container, ['[data-testid="listPrice"]', '.StrikethroughPrice']) || undefined;
        const ratingEl = container.querySelector('[data-testid="review-rating"], [class*="ReviewStars"]');
        const rating = ratingEl ? this.getText(ratingEl).match(/[\d.]+/)?.[0] : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, originalPrice, rating, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
