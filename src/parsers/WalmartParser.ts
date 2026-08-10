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

  /** Reads the tile price, preferring explicit price nodes but falling back to a
   *  currency match anywhere in the tile text (Walmart splits price into many
   *  spans and relabels the automation ids often).
   *
   *  Walmart renders the price twice: an accessible node with the real value
   *  ("current price $37.61") and a visual split ("$37" + "61") that reads back
   *  as "$3761". We therefore prefer a currency amount that INCLUDES cents and
   *  only fall back to a whole-dollar match when no cents form exists, so the
   *  broken "$3761" form is never chosen over the true "$37.61". */
  private extractPrice(container: Element): string {
    const priceEl = this.firstOf(container, [
      '[itemprop="price"]',
      '[data-automation-id="product-price"] span',
      '[data-automation-id="product-price"]',
      '.price-main .price-characteristic',
      '[data-testid="list-view-price"]',
      '[class*="price"]',
    ]);
    const priceText = priceEl ? this.getText(priceEl).replace(/\s+/g, ' ') : '';
    const containerText = this.getText(container).replace(/\s+/g, ' ');
    const WITH_CENTS = /[$£€]\s?[\d,]+\.\d{2}/;
    const WHOLE = /[$£€]\s?[\d,]+/;
    const cents = priceText.match(WITH_CENTS) || containerText.match(WITH_CENTS);
    if (cents) return cents[0].replace(/\s/g, '');
    const whole = priceText.match(WHOLE) || containerText.match(WHOLE);
    return whole ? whole[0].replace(/\s/g, '') : '';
  }

  /** The stable numeric product id inside a "/ip/<slug>/<id>" URL, used to tell
   *  distinct products apart when climbing the DOM to find a tile. */
  private productKey(href: string): string {
    const path = (href || '').split('?')[0];
    const m = path.match(/\/ip\/(?:.*\/)?(\d{4,})/);
    return m ? m[1] : path;
  }

  /** Climbs up from a product link to the widest ancestor that still wraps only
   *  that single product, so the whole tile (image, title, price) is captured.
   *  A tile often has two links to the same product (image + title), so we count
   *  distinct product ids — not raw links — to avoid stopping too early. */
  private tileFor(link: Element): Element {
    const key = this.productKey(this.getAttr(link, 'href'));
    let best: Element = link;
    let el: Element | null = link;
    while (el && el.parentElement && el.parentElement.tagName !== 'BODY') {
      const parent = el.parentElement;
      const keys = new Set(
        Array.from(parent.querySelectorAll('a[href*="/ip/"]'))
          .map((a) => this.productKey(this.getAttr(a, 'href'))),
      );
      keys.delete(key);
      if (keys.size > 0) break; // parent reaches into a neighbouring product
      best = parent;
      el = parent;
    }
    return best;
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    // Walmart reworks its tile markup often, but every product tile still holds a
    // "/ip/" link. Discover tiles from those links (most redesign-proof), and fall
    // back to explicit container selectors when link discovery comes up empty.
    const linkSelector = 'a[href*="/ip/"], a[link-identifier][href], a[data-automation-id="product-title-link"][href]';
    const tiles: Element[] = [];
    const tileHref = new Map<Element, string>();
    const seenTiles = new Set<Element>();
    for (const link of Array.from(doc.querySelectorAll(linkSelector))) {
      const href = this.getAttr(link, 'href');
      if (!href || !/\/ip\//.test(href)) continue;
      const tile = this.tileFor(link);
      if (tile && !seenTiles.has(tile)) {
        seenTiles.add(tile); tiles.push(tile);
        // Remember the link we found the tile by, so its URL is never lost.
        tileHref.set(tile, href);
      }
    }
    const containers = tiles.length
      ? tiles
      : this.allOf(doc, ['[data-item-id]', '[data-testid="item-stack"]', 'article[data-automation-id]', '[data-automation-id="product"]']);
    let itemNumber = start;
    const seenUrls = new Set<string>();
    for (const container of containers) {
      try {
        const linkEl = container.querySelector(linkSelector) as HTMLAnchorElement | null;
        const rawHref = this.getAttr(linkEl, 'href') || tileHref.get(container) || '';
        const url = this.absoluteUrl(rawHref, 'https://www.walmart.com');
        if (url && seenUrls.has(url)) continue;
        const imgEl = container.querySelector('img[data-testid="productTileImage"], img[data-automation-id="image"], img[loading], img[src*="walmartimages"], img') as HTMLImageElement | null;
        const titleEl = this.firstOf(container, ['[data-automation-id="product-title"]', 'span.w_iUH7', '.product-title-link span']);
        const title = this.getText(titleEl) || this.getAttr(linkEl, 'aria-label') || this.getAttr(imgEl, 'alt');
        if (!title || title.length < 3) continue;
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || imgEl?.getAttribute('srcset')?.split(/[,\s]/)[0] || '';
        const price = this.extractPrice(container);
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