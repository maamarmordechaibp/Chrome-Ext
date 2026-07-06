import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail, VariantGroup } from '../types';

export class WalmartParser extends BaseParser {
  readonly marketplace: Marketplace = 'Walmart';
  readonly hostPattern = /walmart\.com/;
  protected readonly pageParam = 'page';

  isDetailPage(doc: Document): boolean {
    return /\/ip\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('h1[itemprop="name"], #main-title');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['h1[itemprop="name"]', '#main-title', 'h1.prod-ProductTitle']));
    if (!title) return null;
    const brand = this.getText(this.firstOf(doc, ['[itemprop="brand"]', '.prod-brandName', '[data-testid="product-brand"]'])).substring(0, 60) || undefined;
    const price = this.getText(this.firstOf(doc, ['[itemprop="price"]', '[data-testid="price-wrap"] span[itemprop="price"]', '[data-testid="price-wrap"] span', 'span[itemprop="price"]']));
    const originalPrice = this.getText(this.firstOf(doc, ['.strike-through', '[data-testid="was-price"] span', 'span.was-price'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['.rating-number', '[itemprop="ratingValue"]'])).match(/[\d.]+/)?.[0];
    const reviews = this.countText(this.firstOf(doc, ['[itemprop="reviewCount"]', '.review-count', '[data-testid="reviews-count"]']));
    const availability = this.getText(this.firstOf(doc, ['.prod-ProductOffer-oosMsg', '[data-testid="fulfillment-shipping-text"]'])).substring(0, 60) || undefined;
    const description = this.getText(this.firstOf(doc, ['[data-testid="product-description-content"]', '.about-desc', '#product-about'])).substring(0, 600) || undefined;

    const features = Array.from(doc.querySelectorAll('[data-testid="product-description"] li, .about-product li, #product-about li'))
      .map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);

    const specs = this.collectSpecs(this.allOf(doc, ['.specification-table tr', '[data-testid="specifications"] tr', '.dangerous-html table tr']));
    const images = this.collectImages(
      Array.from(doc.querySelectorAll('[data-testid="media-thumbnail"] img, .prod-hero-image img, [data-testid="hero-image"] img, [data-testid="media-thumbnail-image"] img')),
      (u) => u.split('?')[0],
    ).slice(0, 8);
    const variants = this.extractVariants(doc);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand, url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, availability, description,
      images, features, specs, variants, timestamp: Date.now(),
    };
  }

  private extractVariants(doc: Document): VariantGroup[] {
    const groups: VariantGroup[] = [];
    const blocks = doc.querySelectorAll('[data-testid="variant-selector"], .variant-group, [class*="variant"]');
    for (const block of Array.from(blocks).slice(0, 4)) {
      const name = this.getText(block.querySelector('label, .variant-title, [class*="label"]')) || 'Options';
      const opts = Array.from(block.querySelectorAll('[data-testid="variant-item"], .variant-swatch, button[aria-label]'))
        .map((el) => this.getAttr(el, 'aria-label') || this.getText(el)).map((t) => t.trim()).filter((t) => t && t.length <= 40);
      const uniq = Array.from(new Set(opts)).slice(0, 20);
      if (uniq.length) groups.push({ name: name.substring(0, 30), options: uniq.map((label) => ({ label })) });
    }
    return groups;
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('q') || '';
    const pageEl = doc.querySelector('[aria-current="page"], .paginator-btn-active');
    const currentPage = parseInt(this.getText(pageEl) || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    // Walmart reworks its tile markup often, but every product tile still holds a
    // "/ip/" link. Discover tiles from those links (most redesign-proof), and fall
    // back to explicit container selectors when link discovery comes up empty.
    const tiles: Element[] = [];
    const seenTiles = new Set<Element>();
    for (const link of Array.from(doc.querySelectorAll('a[href*="/ip/"]'))) {
      const tile = link.closest('[data-item-id], [data-testid="list-view"] > div, [role="group"], li') || link.parentElement;
      if (tile && !seenTiles.has(tile)) { seenTiles.add(tile); tiles.push(tile); }
    }
    const containers = tiles.length
      ? tiles
      : this.allOf(doc, ['[data-item-id]', '[data-testid="item-stack"]', 'article[data-automation-id]', '[data-automation-id="product"]']);
    let itemNumber = start;
    const seenUrls = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector('a[href*="/ip/"], a[link-identifier], a[data-automation-id="product-title-link"]') as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.walmart.com');
        if (url && seenUrls.has(url)) continue;
        const imgEl = container.querySelector('img[data-testid="productTileImage"], img[data-automation-id="image"], img[loading]') as HTMLImageElement | null;
        const titleEl = this.firstOf(container, ['[data-automation-id="product-title"]', 'span.w_iUH7', '.product-title-link span']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(imgEl, 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
        const priceEl = this.firstOf(container, ['[itemprop="price"]', '[data-automation-id="product-price"] span', '.price-main .price-characteristic', '[data-automation-id="product-price"]']);
        const price = priceEl ? this.getText(priceEl).replace(/\s+/g, ' ').match(/[$£€][\d,.]+/)?.[0] || this.getText(priceEl) : '';
        const ratingEl = container.querySelector('[aria-label*="stars"], [data-automation-id="rating"], [class*="rating"]');
        const rating = this.getAttr(ratingEl, 'aria-label').match(/[\d.]+/)?.[0];
        const reviewEl = container.querySelector('[data-automation-id="review-count"], [class*="review"]');
        const reviews = reviewEl ? this.countText(reviewEl) : undefined;
        const shippingEl = container.querySelector('[data-automation-id="fulfillment-badge"], [class*="fulfillment"]');
        const shipping = shippingEl ? this.getText(shippingEl).substring(0, 60) : undefined;
        const descEl = this.firstOf(container, ['[data-automation-id="product-subtitle"]', '[data-automation-id="product-attribute"]']);
        const descRaw = descEl ? this.getText(descEl) : '';
        const description = descRaw.length >= 3 ? descRaw.substring(0, 90) : undefined;
        if (url) seenUrls.add(url);
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, rating, reviews, description, shipping, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}