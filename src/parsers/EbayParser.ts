import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail, SpecRow, VariantGroup } from '../types';

export class EbayParser extends BaseParser {
  readonly marketplace: Marketplace = 'eBay';
  readonly hostPattern = /ebay\.(com|co\.uk|ca|com\.au|de|fr|es|it)/;
  protected readonly pageParam = '_pgn';

  isDetailPage(doc: Document): boolean {
    return /\/itm\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('.x-item-title__mainTitle');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['.x-item-title__mainTitle span', 'h1.x-item-title span', '#itemTitle']))
      .replace(/^details about\s*/i, '');
    if (!title) return null;
    const price = this.getText(this.firstOf(doc, ['.x-price-primary span', '#prcIsum', '.x-bin-price__content span']));
    const originalPrice = this.getText(this.firstOf(doc, ['.x-additional-info .ux-textspans--STRIKETHROUGH', '.vi-originalPrice'])) || undefined;
    const seller = this.getText(this.firstOf(doc, ['.x-sellercard-atf__info__about-seller span', '.mbg-nw'])).substring(0, 40) || undefined;
    const availability = this.getText(this.firstOf(doc, ['.d-quantity__availability span', '.qtyTxt', '.x-quantity__availability span'])).substring(0, 60) || undefined;
    const shipping = this.getText(this.firstOf(doc, ['.ux-labels-values--shipping .ux-textspans', '.vi-acc-del-range'])).substring(0, 80) || undefined;
    const description = this.getText(this.firstOf(doc, ['.x-item-title__subtitle', '.x-item-condition-text'])).substring(0, 200) || undefined;

    const images = this.collectImages(
      Array.from(doc.querySelectorAll('.ux-image-carousel-item img, .ux-image-grid img, .ux-image-filmstrip-carousel img, #icImg')),
      (u) => u.replace(/s-l\d+\./, 's-l1600.'),
    ).slice(0, 8);

    const specs = this.extractItemSpecifics(doc);
    const variants = this.extractVariants(doc);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), url: doc.location?.href ?? '',
      price, originalPrice, seller, availability, shipping, description,
      images, features: [], specs, variants, timestamp: Date.now(),
    };
  }

  /** eBay item specifics use paired label/value cells rather than a <table>. */
  private extractItemSpecifics(doc: Document): SpecRow[] {
    const out: SpecRow[] = [];
    const rows = doc.querySelectorAll('.ux-labels-values');
    for (const row of Array.from(rows)) {
      const label = this.getText(row.querySelector('.ux-labels-values__labels-content, .ux-labels-values__labels'));
      const value = this.getText(row.querySelector('.ux-labels-values__values-content, .ux-labels-values__values'));
      if (label && value && out.length < 40) out.push({ label: label.substring(0, 50), value: value.substring(0, 120) });
    }
    return out;
  }

  private extractVariants(doc: Document): VariantGroup[] {
    const groups: VariantGroup[] = [];
    const selects = doc.querySelectorAll('.x-msku__select-box select, .x-msku select, select.msku-sel');
    for (const sel of Array.from(selects)) {
      const name = this.getText(sel.closest('.x-msku__container, .msku')?.querySelector('label') ?? null) || 'Options';
      const options = Array.from(sel.querySelectorAll('option'))
        .map((o) => this.getText(o)).filter((t) => t && !/select/i.test(t)).slice(0, 20)
        .map((label) => ({ label: label.substring(0, 40) }));
      if (options.length) groups.push({ name: name.substring(0, 30), options });
    }
    return groups;
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('_nkw') || params.get('q') || '';
    const activeEl = doc.querySelector('.pagination__item--active, [aria-current="page"]');
    const currentPage = parseInt(this.getText(activeEl) || '1', 10) || 1;
    const allEls = doc.querySelectorAll('.pagination__item');
    const totalPages = allEls.length > 0 ? parseInt(this.getText(allEls[allEls.length - 1]) || '0', 10) || undefined : undefined;
    return { marketplace: this.marketplace, searchKeywords, currentPage, totalPages, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    // eBay serves two search layouts: the legacy ".s-item" list and the newer
    // ".s-card" grid. Prefer whichever the page uses.
    let containers = Array.from(doc.querySelectorAll('li.s-card, .s-card.s-card--vertical'));
    const isCard = containers.length > 0;
    if (!isCard) containers = Array.from(doc.querySelectorAll('.s-item'));
    let itemNumber = start;
    for (const container of containers) {
      try {
        const product = isCard
          ? this.extractCard(container, searchKeywords, page, itemNumber)
          : this.extractLegacyItem(container, searchKeywords, page, itemNumber);
        if (!product) continue;
        products.push(product);
        itemNumber++;
      } catch { /* skip */ }
    }
    return products;
  }

  /** Legacy ".s-item" list layout. */
  private extractLegacyItem(container: Element, searchKeywords: string, page: number, itemNumber: number): Product | null {
    const title = this.getText(container.querySelector('.s-item__title'));
    if (!title || title === 'Shop on eBay') return null;
    const imgEl = container.querySelector('.s-item__image-img') as HTMLImageElement | null;
    const imageUrl = (imgEl?.getAttribute('data-src') || imgEl?.src || '').replace(/s-l\d+\./, 's-l500.');
    const price = this.getText(container.querySelector('.s-item__price'));
    const shippingEl = container.querySelector('.s-item__shipping, .s-item__logisticsCost');
    const shipping = shippingEl ? this.getText(shippingEl).substring(0, 60) : undefined;
    const sellerEl = container.querySelector('.s-item__seller-info-text');
    const seller = sellerEl ? this.getText(sellerEl).substring(0, 40) : undefined;
    const condEl = container.querySelector('.SECONDARY_INFO');
    const availability = condEl ? this.getText(condEl) : undefined;
    const subtitleEl = container.querySelector('.s-item__subtitle');
    const description = subtitleEl ? this.getText(subtitleEl).substring(0, 90) : undefined;
    const ratingEl = container.querySelector('.x-star-rating .clipped');
    const rating = ratingEl ? this.getText(ratingEl).split(' ')[0] : undefined;
    const reviewEl = container.querySelector('.s-item__reviews-count span');
    const reviews = reviewEl ? this.getText(reviewEl) : undefined;
    const linkEl = container.querySelector('.s-item__link') as HTMLAnchorElement | null;
    const url = this.getAttr(linkEl, 'href');
    return { id: this.generateId(), itemNumber, marketplace: this.marketplace,
      title: title.substring(0, 200), imageUrl, price, rating, reviews, seller, shipping, availability, description,
      page, url, searchKeywords, timestamp: Date.now() };
  }

  /** Newer ".s-card" grid layout. */
  private extractCard(container: Element, searchKeywords: string, page: number, itemNumber: number): Product | null {
    const title = this.getText(this.firstOf(container, ['.s-card__title', '[class*="s-card__title"]']))
      || this.getText(container.querySelector('a[href*="/itm/"]'));
    if (!title || /^shop on ebay$/i.test(title)) return null;
    const linkEl = container.querySelector('a[href*="/itm/"]') as HTMLAnchorElement | null;
    const url = this.getAttr(linkEl, 'href');
    const imgEl = container.querySelector('img') as HTMLImageElement | null;
    const imageUrl = (imgEl?.getAttribute('data-src') || imgEl?.src || '').replace(/s-l\d+\./, 's-l500.');
    let price = this.getText(this.firstOf(container, ['.s-card__price', '[class*="s-card__price"]']));
    if (!price) {
      const priceEl = Array.from(container.querySelectorAll('span')).find((s) => /[$£€][\d,]/.test(s.textContent ?? ''));
      price = priceEl ? this.getText(priceEl) : '';
    }
    const originalPrice = this.getText(this.firstOf(container, ['.s-card__price--strikethrough', '[class*="strikethrough"]'])) || undefined;
    // The card stacks free-form attribute rows (condition, shipping, seller, subtitle).
    const rows = Array.from(container.querySelectorAll('.s-card__attribute-row, [class*="s-card__subtitle"], [class*="s-card__caption"]'))
      .map((r) => this.getText(r)).filter((t) => t && t !== price);
    const availability = rows.find((t) => /\b(brand new|pre-?owned|new|used|open box|refurbished|for parts)\b/i.test(t));
    const shipping = rows.find((t) => /\b(deliver|shipping|postage|pickup|freight)\b/i.test(t))?.substring(0, 60);
    const seller = rows.find((t) => /%\s*positive/i.test(t))?.substring(0, 40);
    const description = rows.find((t) => t !== availability && t !== shipping && t !== seller)?.substring(0, 90);
    const ratingEl = container.querySelector('.x-star-rating .clipped, [class*="star-rating"] .clipped');
    const rating = ratingEl ? this.getText(ratingEl).split(' ')[0] : undefined;
    const reviewEl = container.querySelector('.s-card__reviews-count span, [class*="reviews-count"] span');
    const reviews = reviewEl ? this.getText(reviewEl) : undefined;
    return { id: this.generateId(), itemNumber, marketplace: this.marketplace,
      title: title.substring(0, 200), imageUrl, price, originalPrice, rating, reviews, seller, shipping, availability, description,
      page, url, searchKeywords, timestamp: Date.now() };
  }
}