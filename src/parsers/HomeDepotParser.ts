import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /p/<slug>/<id>. Search links share the /p/ prefix. */
const PRODUCT_LINK = 'a[href*="/p/"]';

export class HomeDepotParser extends BaseParser {
  readonly marketplace: Marketplace = 'Home Depot';
  readonly hostPattern = /homedepot\.com/;
  protected readonly pageParam = 'Nao';

  isDetailPage(doc: Document): boolean {
    return /\/p\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('h1.product-details__title, [data-testid="product-title"]');
  }

  private key(href: string): string {
    const path = (href || '').split('?')[0];
    return path.match(/\/(\d{6,})(?:$|\/)/)?.[1] ?? path.replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['h1.product-details__title', '[data-testid="product-title"]', 'h1[itemprop="name"]', 'h1']));
    if (!title || title.length < 3) return null;
    const brand = this.getText(this.firstOf(doc, ['.product-details__brand-name', '[itemprop="brand"]', 'a[href*="/b/"]'])).substring(0, 60) || undefined;
    const price = this.priceFrom(this.firstOf(doc, ['[data-testid="product-price"]', '.price-format__main-price', '[class*="price"]']));
    const rating = this.getText(this.firstOf(doc, ['.ratings-reviews__average', '[itemprop="ratingValue"]'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['.ratings-reviews__count', '[itemprop="reviewCount"]']));
    const description = this.getText(this.firstOf(doc, ['[data-testid="product-overview"]', '.product-details__description'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('.product-details__highlights li, [data-testid="highlights"] li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const specs = this.collectSpecs(this.allOf(doc, ['.specs__table tr', '[data-testid="specifications"] .specs__row', '.specifications tr']));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('.mediagallery__mainimage img, [data-testid="product-image"] img, .thumbnails img')),
      (u) => u.replace(/_\d+\.(jpg|png|webp)/i, '_1000.$1'),
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, rating, reviews, description,
      images, features, specs, variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const path = doc.location?.pathname ?? '';
    const searchKeywords = params.get('keyword') || params.get('q') || decodeURIComponent(path.match(/\/s\/([^/?]+)/)?.[1] ?? '').replace(/[+-]/g, ' ');
    const offset = parseInt(params.get('Nao') || '0', 10) || 0;
    const currentPage = Math.floor(offset / 24) + 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['[data-testid="product-pod"]', '.product-pod', '[class*="product-pod"]']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(PRODUCT_LINK) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.homedepot.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['[data-testid="product-header"]', '.product-pod__title', 'header span', 'h3', 'h2']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickImage(container);
        const price = this.priceFrom(container, ['[data-testid="product-price"]', '.price-format__main-price', '[class*="price"]']);
        const brandEl = this.firstOf(container, ['.product-pod__brand-name', '[data-testid="attribute-brandname-above"]']);
        const brand = brandEl ? this.getText(brandEl).substring(0, 40) : undefined;
        const ratingEl = container.querySelector('.stars, [class*="ratings"]');
        const rating = ratingEl ? this.getAttr(ratingEl, 'aria-label').match(/[\d.]+/)?.[0] : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, brand, rating, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
