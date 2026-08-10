import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /shop/product/<slug>?ID=<id>. */
const PRODUCT_LINK = 'a[href*="/shop/product/"]';

export class MacysParser extends BaseParser {
  readonly marketplace: Marketplace = "Macy's";
  readonly hostPattern = /macys\.com/;
  protected readonly pageParam = 'Pageindex';

  isDetailPage(doc: Document): boolean {
    return /\/shop\/product\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('[data-auto="product-name"], h1.p-name');
  }

  private key(href: string): string {
    const q = (href || '').match(/[?&]ID=(\d+)/);
    if (q) return q[1];
    return (href || '').split('?')[0].replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['[data-auto="product-name"]', 'h1.p-name', 'h1']));
    if (!title || title.length < 3) return null;
    const brand = this.getText(this.firstOf(doc, ['[data-auto="product-brand"]', '.brand-name-link', 'a[href*="/brand/"]'])).substring(0, 60) || undefined;
    const price = this.priceFrom(this.firstOf(doc, ['[data-auto="main-price"]', '.price-value', '[class*="price"]']));
    const originalPrice = this.priceFrom(this.firstOf(doc, ['[data-auto="original-price"]', '.was-price', '.original-price'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['[data-auto="rating"]', '.stars-container'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['[data-auto="review-count"]', '.review-count']));
    const description = this.getText(this.firstOf(doc, ['[data-auto="product-description"]', '.product-description'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('.bullets li, [data-auto="product-details"] li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('.main-image-container img, .thumbnail-image img, [data-auto="product-image"] img')),
      (u) => u.replace(/\?.*$/, ''),
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, description,
      images, features, specs: [], variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('keyword') || params.get('Keyword') || '';
    const currentPage = parseInt(params.get('Pageindex') || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['[data-auto="product-cell"]', '.productThumbnail', 'li.productThumbnailItem']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(PRODUCT_LINK) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.macys.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['[data-auto="product-name"]', '.productDescription', 'h3', 'h2']);
        const brandEl = this.firstOf(container, ['[data-auto="product-brand"]', '.productBrand']);
        const brand = brandEl ? this.getText(brandEl).substring(0, 40) : undefined;
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickImage(container);
        const price = this.priceFrom(container, ['[data-auto="main-price"]', '.prices .price', '[class*="price"]']);
        const originalPrice = this.priceFrom(container, ['[data-auto="original-price"]', '.was-price']) || undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, originalPrice, brand, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
