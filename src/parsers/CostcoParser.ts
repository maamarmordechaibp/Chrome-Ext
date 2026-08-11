import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /<slug>.product.<id>.html. */
const PRODUCT_LINK = 'a[href*=".product."]';

export class CostcoParser extends BaseParser {
  readonly marketplace: Marketplace = 'Costco';
  readonly hostPattern = /costco\.com/;
  protected readonly pageParam = 'currentPage';

  isDetailPage(doc: Document): boolean {
    return /\.product\./.test(doc.location?.pathname ?? '') || !!doc.querySelector('h1[itemprop="name"], .product-title');
  }

  private key(href: string): string {
    const path = (href || '').split('?')[0];
    return path.match(/\.product\.(\d+)\.html/)?.[1] ?? path.replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['h1[itemprop="name"]', '.product-title', 'h1']));
    if (!title || title.length < 3) return null;
    const price = this.priceFrom(this.firstOf(doc, ['.value[automation-id="productPriceOutput"]', '[automation-id="productPriceOutput"]', '.your-price .value', '[class*="price"]']));
    const rating = this.getText(this.firstOf(doc, ['.averageRating', '[itemprop="ratingValue"]'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['.reviewCount', '[itemprop="reviewCount"]']));
    const description = this.getText(this.firstOf(doc, ['#product-details-tab', '.product-info-description'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('.product-info-description li, #productDetailsList li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const specs = this.collectSpecs(this.allOf(doc, ['.product-info-specs tr', '.spec-table tr']));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('#productImageWrapper img, .thumbnails img, [class*="gallery"] img')),
      (u) => u.replace(/\?.*$/, ''),
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), url: doc.location?.href ?? '',
      price, rating, reviews, description,
      images, features, specs, variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('keyword') || params.get('q') || '';
    const currentPage = parseInt(params.get('currentPage') || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['.product-tile-set', '[automation-id^="productList"]', '.product']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(PRODUCT_LINK) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.costco.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['.description a', '[automation-id="productDescriptionLink"]', 'p.description', 'h3', 'h2']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickTileImage(container);
        const price = this.priceFrom(container, ['.price', '[automation-id="productPriceOutput"]', '[class*="price"]']);
        const ratingEl = container.querySelector('.averageRating, [class*="rating"]');
        const rating = ratingEl ? this.getText(ratingEl).match(/[\d.]+/)?.[0] : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, rating, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
