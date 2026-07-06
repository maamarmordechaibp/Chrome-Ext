import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail, VariantGroup } from '../types';

export class AmazonParser extends BaseParser {
  readonly marketplace: Marketplace = 'Amazon';
  readonly hostPattern = /amazon\.(com|ca|co\.uk|com\.au|de|fr|es|it|co\.jp)/;
  protected readonly pageParam = 'page';

  isDetailPage(doc: Document): boolean {
    const path = doc.location?.pathname ?? '';
    return /\/(dp|gp\/product|gp\/aw\/d)\//.test(path) || !!doc.querySelector('#productTitle');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(doc.querySelector('#productTitle, #title span'));
    if (!title) return null;
    const brandRaw = this.getText(doc.querySelector('#bylineInfo, a#bylineInfo, #brand'));
    const brand = brandRaw ? brandRaw.replace(/^(visit the|brand:)\s*/i, '').replace(/\s*store$/i, '').substring(0, 60) : undefined;

    const price = this.getText(this.firstOf(doc, [
      '#corePrice_feature_div .a-offscreen', '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#priceblock_ourprice', '#priceblock_dealprice', '.a-price .a-offscreen',
    ]));
    const originalPrice = this.getText(this.firstOf(doc, [
      '#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen', '.a-text-price .a-offscreen', 'span[data-a-strike="true"] .a-offscreen',
    ])) || undefined;
    const discount = this.getText(this.firstOf(doc, ['.savingsPercentage', '#corePriceDisplay_desktop_feature_div .savingPriceOverride'])) || undefined;

    const ratingAlt = this.getText(this.firstOf(doc, [
      '#acrPopover .a-icon-alt', 'span[data-hook="rating-out-of-text"]', '#averageCustomerReviews .a-icon-alt',
    ])) || this.getAttr(doc.querySelector('#acrPopover'), 'title');
    const rating = ratingAlt.match(/([\d.]+)\s*out of/i)?.[1] || ratingAlt.match(/^[\d.]+/)?.[0] || undefined;
    const reviews = this.countText(doc.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]'));
    const availability = this.getText(this.firstOf(doc, ['#availability span', '#availability'])) || undefined;

    const description = this.getText(this.firstOf(doc, ['#productDescription p', '#productDescription', '#bookDescription_feature_div'])).substring(0, 600) || undefined;

    const bulletEls = doc.querySelectorAll('#feature-bullets li span.a-list-item');
    const featureEls = bulletEls.length ? Array.from(bulletEls) : Array.from(doc.querySelectorAll('#feature-bullets li'));
    const features = featureEls.map((el) => this.getText(el)).filter((t) => t.length > 2).slice(0, 12);

    const specRows = this.allOf(doc, [
      '#productDetails_techSpec_section_1 tr', '#productDetails_detailBullets_sections1 tr',
      '.prodDetTable tr', '#technicalSpecifications_section_1 tr',
    ]);
    const specs = this.collectSpecs(specRows);

    const images = this.collectDetailImages(doc);
    const variants = this.extractVariants(doc);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), brand,
      url: doc.location?.href ?? '', price, originalPrice, discount,
      rating, reviews, availability, description,
      images, features, specs, variants, timestamp: Date.now(),
    };
  }

  /** Gathers the gallery images and upgrades thumbnails to full-resolution URLs. */
  private collectDetailImages(doc: Document): string[] {
    const upgrade = (u: string) => u.replace(/\._[^.]+_\./, '.');
    const els = [
      ...Array.from(doc.querySelectorAll('#altImages img, #imageBlockThumbs img')),
      ...Array.from(doc.querySelectorAll('#imgTagWrapperId img, #landingImage, #main-image-container img')),
    ];
    return this.collectImages(els, upgrade).slice(0, 8);
  }

  private extractVariants(doc: Document): VariantGroup[] {
    const groups: VariantGroup[] = [];
    const map: Array<[string, string]> = [
      ['#variation_size_name', 'Size'], ['#variation_color_name', 'Color'], ['#variation_style_name', 'Style'],
    ];
    for (const [sel, name] of map) {
      const root = doc.querySelector(sel);
      if (!root) continue;
      const opts = Array.from(root.querySelectorAll('li'))
        .map((li) => this.getAttr(li, 'title').replace(/^.*:\s*/, '') || this.getText(li.querySelector('img')) || this.getText(li))
        .map((t) => t.trim()).filter((t) => t && t.length <= 40);
      const uniq = Array.from(new Set(opts)).slice(0, 20);
      if (uniq.length) groups.push({ name, options: uniq.map((label) => ({ label })) });
    }
    return groups;
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const inputEl = doc.querySelector('#twotabsearchtextbox') as HTMLInputElement | null;
    const searchKeywords = inputEl?.value || params.get('k') || params.get('field-keywords') || '';
    const selectedPage = doc.querySelector('.s-pagination-selected');
    const currentPage = parseInt(this.getText(selectedPage) || '1', 10) || 1;
    const items = doc.querySelectorAll('.s-pagination-item:not(.s-pagination-previous):not(.s-pagination-next)');
    const last = items[items.length - 1];
    const totalPages = last ? parseInt(this.getText(last) || '0', 10) || undefined : undefined;
    return { marketplace: this.marketplace, searchKeywords, currentPage, totalPages, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const containers = this.allOf(doc, ['[data-component-type="s-search-result"]', '[data-asin]:not([data-asin=""])']);
    let itemNumber = start;
    for (const container of containers) {
      try {
        const titleEl = container.querySelector('h2 a span, [data-cy="title-recipe"] h2 span');
        const title = this.getText(titleEl);
        if (!title || title.length < 3) continue;
        const imgEl = container.querySelector('.s-image') as HTMLImageElement | null;
        const imageUrl = this.pickImage(imgEl);
        const priceOS = container.querySelector('.a-price:not(.a-text-price) .a-offscreen');
        const whole = container.querySelector('.a-price-whole');
        const fraction = container.querySelector('.a-price-fraction');
        const price = priceOS ? this.getText(priceOS)
          : (whole ? `$${this.getText(whole).replace(/[^\d]/g, '')}.${this.getText(fraction) || '00'}` : '');
        const origEl = container.querySelector('.a-text-price .a-offscreen');
        const originalPrice = origEl ? this.getText(origEl) : undefined;
        const discountEl = container.querySelector('.savingsPercentage');
        const discount = discountEl ? this.getText(discountEl) : undefined;
        const ratingAlt = this.getText(container.querySelector('.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt, .a-icon-alt'));
        const rating = ratingAlt.match(/([\d.]+)\s*out of/i)?.[1] || ratingAlt.match(/^[\d.]+/)?.[0] || undefined;
        // Review count lives in the labelled ratings link; validate it is numeric to avoid junk like "ad feedback".
        const reviewEl = container.querySelector('[aria-label*="rating"] + a .s-underline-text, a[aria-label*="ratings"] .s-underline-text, .a-size-base.s-underline-text');
        const reviews = this.countText(reviewEl);
        const isPrime = !!container.querySelector('[aria-label="Amazon Prime"], .s-prime, .a-icon-prime');
        const shippingEl = container.querySelector('[data-cy="delivery-recipe"] .a-color-base, [data-cy="delivery-recipe"] span');
        const shippingRaw = shippingEl ? this.getText(shippingEl) : '';
        const shipping = shippingRaw ? shippingRaw.substring(0, 60) : undefined;
        const isSponsored = !!container.querySelector('[data-component-type="s-sponsored-label-info-icon"]');
        const brandEl = container.querySelector('[data-cy="brand"] .a-size-base-plus, [data-cy="brand"] span, [data-cy="brand"]');
        const brandRaw = brandEl ? this.getText(brandEl) : '';
        const brand = brandRaw && brandRaw.length <= 40 ? brandRaw : undefined;
        const descEl = this.firstOf(container, ['[data-cy="secondary-recipe"] span', '.a-row .a-size-base.a-color-secondary']);
        const descRaw = descEl ? this.getText(descEl) : '';
        const description = descRaw.length >= 3 ? descRaw.substring(0, 90) : undefined;
        const linkEl = container.querySelector('h2 a[href]') as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.amazon.com');
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, originalPrice, discount, rating, reviews,
          brand, description, shipping, isPrime, isSponsored, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
     }
    return products;
  }

  /** Chooses the highest-resolution real image, skipping tiny lazy-load data: placeholders. */
  private pickImage(img: HTMLImageElement | null): string {
    if (!img) return '';
    const srcset = img.getAttribute('srcset') || '';
    if (srcset) {
      const best = srcset.split(',')
        .map((s) => s.trim().split(' '))
        .filter((p) => p[0] && !p[0].startsWith('data:'))
        .pop();
      if (best?.[0]) return best[0];
    }
    const candidates = [img.getAttribute('src'), img.getAttribute('data-src')]
      .map((s) => s?.trim() ?? '')
      .filter((s) => s && !s.startsWith('data:'));
    const raw = candidates[0] ?? '';
    return raw.replace(/_AC_US\d+_/, '_AC_SL500_').replace(/_AC_UL\d+_/, '_AC_SL500_');
  }
}