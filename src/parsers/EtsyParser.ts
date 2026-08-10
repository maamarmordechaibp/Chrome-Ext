import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail } from '../types';

/** Product-page path: /listing/<id>/<slug>. */
const PRODUCT_LINK = 'a[href*="/listing/"]';

export class EtsyParser extends BaseParser {
  readonly marketplace: Marketplace = 'Etsy';
  readonly hostPattern = /etsy\.com/;
  protected readonly pageParam = 'page';

  isDetailPage(doc: Document): boolean {
    return /\/listing\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('h1[data-buy-box-listing-title], h1[data-listing-title]');
  }

  private key(href: string): string {
    return (href || '').match(/\/listing\/(\d+)/)?.[1] ?? (href || '').split('?')[0].replace(/\/$/, '');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['h1[data-buy-box-listing-title]', 'h1[data-listing-title]', 'h1']));
    if (!title || title.length < 3) return null;
    const seller = this.getText(this.firstOf(doc, ['[data-shop-name]', 'a[href*="/shop/"] span', '.shop-name'])).substring(0, 60) || undefined;
    const price = this.priceFrom(this.firstOf(doc, ['[data-buy-box-region="price"]', '[data-selector="price-only"]', '.wt-text-title-larger', '[class*="price"]']));
    const originalPrice = this.priceFrom(this.firstOf(doc, ['.wt-text-strikethrough', '[data-original-price]'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['[data-rating]', '.wt-display-inline-flex input[name="rating"]', '.stars-svg'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['[data-reviews-total-count]', '.wt-text-caption a']));
    const description = this.getText(this.firstOf(doc, ['[data-product-details-description-text-content]', '#wt-content-toggle-product-details-read-more'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('#legacy-highlights-toggle li, [data-highlights] li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('.listing-page-image-carousel-component img, [data-carousel-pane] img, .image-carousel-container img')),
      (u) => u.replace(/il_\d+x\d+/, 'il_1140xN'),
    ).slice(0, 8);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), seller, url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, description,
      images, features, specs: [], variants: [], timestamp: Date.now(),
    };
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('q') || params.get('search_query') || '';
    const currentPage = parseInt(params.get('page') || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const tiles = this.discoverTiles(doc, PRODUCT_LINK, (h) => this.key(h));
    const containers = tiles.length ? tiles : this.allOf(doc, ['[data-listing-card]', '.v2-listing-card', 'li.wt-list-unstyled']);
    let itemNumber = start;
    const seen = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(PRODUCT_LINK) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.etsy.com');
        if (url && seen.has(url)) continue;
        const titleEl = this.firstOf(container, ['h3[data-listing-card-title]', '.v2-listing-card__title', 'h3', 'h2']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'title') || this.getAttr(linkEl, 'aria-label') || this.getAttr(container.querySelector('img'), 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = this.pickImage(container);
        const price = this.priceFrom(container, ['.wt-text-title-01', '[data-buy-box-region="price"]', '.n-listing-card__price', '[class*="price"]']);
        const originalPrice = this.priceFrom(container, ['.wt-text-strikethrough', '[data-original-price]']) || undefined;
        const sellerEl = this.firstOf(container, ['[data-shop-name]', '.v2-listing-card__shop', 'p.wt-text-caption']);
        const seller = sellerEl ? this.getText(sellerEl).substring(0, 40) : undefined;
        const ratingEl = container.querySelector('[data-rating], .wt-display-inline-block input[name="rating"]');
        const rating = ratingEl ? (this.getAttr(ratingEl, 'value') || this.getText(ratingEl)).match(/[\d.]+/)?.[0] : undefined;
        if (url) seen.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, originalPrice, seller, rating, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}
