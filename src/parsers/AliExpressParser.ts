import { BaseParser } from './BaseParser';
import { Product, PageInfo, Marketplace, ProductDetail, SpecRow, VariantGroup } from '../types';

export class AliExpressParser extends BaseParser {
  readonly marketplace: Marketplace = 'AliExpress';
  readonly hostPattern = /aliexpress\.(com|us)/;
  protected readonly pageParam = 'page';

  isDetailPage(doc: Document): boolean {
    return /\/item\//.test(doc.location?.pathname ?? '') || !!doc.querySelector('h1[data-pl="product-title"], .product-title-text');
  }

  extractDetail(doc: Document): ProductDetail | null {
    const title = this.getText(this.firstOf(doc, ['h1[data-pl="product-title"]', '.product-title-text', '[class*="title--wrap"] h1', 'h1']));
    if (!title || title.length < 3) return null;
    const price = this.getText(this.firstOf(doc, ['[class*="price--current"]', '.product-price-value', '.uniform-banner-box-price'])).split('–')[0].trim();
    const originalPrice = this.getText(this.firstOf(doc, ['[class*="price--original"]', '.product-price-del'])) || undefined;
    const rating = this.getText(this.firstOf(doc, ['[class*="reviewer--rating"]', '[class*="rating--"]'])).match(/[\d.]+/)?.[0];
    const reviews = this.getText(this.firstOf(doc, ['[class*="reviewer--reviews"]', '[class*="reviews--"]'])).substring(0, 30) || undefined;
    const description = this.getText(this.firstOf(doc, ['[class*="subtitle--"]', '.product-description'])).substring(0, 300) || undefined;

    const images = this.collectImages(
      Array.from(doc.querySelectorAll('[class*="slider--img"] img, .images-view-item img, [class*="magnifier--image"], [class*="thumb--"] img')),
      (u) => u.replace(/(\.(jpg|jpeg|png|webp))_.*$/i, '$1'),
    ).slice(0, 8);

    const specs = this.extractSpecs(doc);
    const variants = this.extractVariants(doc);

    return {
      marketplace: this.marketplace, title: title.substring(0, 200), url: doc.location?.href ?? '',
      price, originalPrice, rating, reviews, description,
      images, features: [], specs, variants, timestamp: Date.now(),
    };
  }

  private extractSpecs(doc: Document): SpecRow[] {
    const out: SpecRow[] = [];
    const rows = doc.querySelectorAll('[class*="specification--prop"], .product-property-list li');
    for (const row of Array.from(rows)) {
      const label = this.getText(row.querySelector('[class*="specification--title"], .property-title, dt'));
      const value = this.getText(row.querySelector('[class*="specification--desc"], .property-desc, dd'));
      if (label && value && out.length < 40) out.push({ label: label.substring(0, 50), value: value.substring(0, 120) });
    }
    return out;
  }

  private extractVariants(doc: Document): VariantGroup[] {
    const groups: VariantGroup[] = [];
    const blocks = doc.querySelectorAll('[class*="sku-item--wrap"], [class*="sku-property"]');
    for (const block of Array.from(blocks).slice(0, 4)) {
      const name = this.getText(block.querySelector('[class*="sku-item--title"], [class*="sku-title"], .sku-property-info')).replace(/:.*$/, '') || 'Options';
      const opts = Array.from(block.querySelectorAll('[class*="sku-property-item"], [class*="sku-item--"] img, [class*="sku-item--"] span'))
        .map((el) => this.getAttr(el, 'title') || this.getAttr(el, 'alt') || this.getText(el)).map((t) => t.trim()).filter((t) => t && t.length <= 40);
      const uniq = Array.from(new Set(opts)).slice(0, 20);
      if (uniq.length) groups.push({ name: name.substring(0, 30), options: uniq.map((label) => ({ label })) });
    }
    return groups;
  }

  extractPageInfo(doc: Document): PageInfo {
    const params = new URLSearchParams(doc.location?.search ?? '');
    const searchKeywords = params.get('SearchText') || params.get('q') || '';
    const activeEl = doc.querySelector('.comet-pagination-item-active, [class*="Pagination--current"]');
    const currentPage = parseInt(this.getText(activeEl) || '1', 10) || 1;
    return { marketplace: this.marketplace, searchKeywords, currentPage, isSupported: true, url: doc.location?.href ?? '' };
  }

  extractProducts(doc: Document, searchKeywords: string, page: number, start: number): Product[] {
    const products: Product[] = [];
    const containers = this.allOf(doc, ['.search-item-card-wrapper-gallery', '[class*="SearchResults--"] > div', '.list--gallery--C2f2tvm > div']);
    let itemNumber = start;
    for (const container of containers) {
      try {
        const titleEl = container.querySelector('[class*="title--"], h1, h2, h3, [class*="Title"]');
        const title = this.getText(titleEl);
        if (!title || title.length < 3) continue;
        const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
        const imgEl = imgs.find((img) => img.src && !img.src.startsWith('data:'));
        const imageUrl = imgEl?.src || '';
        const priceEl = container.querySelector('[class*="price--"], [class*="Price"]');
        const price = priceEl ? this.getText(priceEl).split('–')[0].trim() : '';
        const ratingEl = container.querySelector('[class*="rate--"], [class*="Rating--stars"]');
        const rating = ratingEl ? this.getText(ratingEl).match(/[\d.]+/)?.[0] : undefined;
        const reviewEl = container.querySelector('[class*="trade--"], [class*="Sold"]');
        const reviews = reviewEl ? this.getText(reviewEl).substring(0, 30) : undefined;
        const shippingEl = container.querySelector('[class*="shipping--"], [class*="free-shipping"]');
        const shipping = shippingEl ? this.getText(shippingEl).substring(0, 40) : undefined;
        const descEl = container.querySelector('[class*="subtitle--"], [class*="desc--"]');
        const descRaw = descEl ? this.getText(descEl) : '';
        const description = descRaw.length >= 3 ? descRaw.substring(0, 90) : undefined;
        const linkEl = (container.tagName === 'A' ? container : container.querySelector('a[href]')) as HTMLAnchorElement | null;
        const url = this.absoluteUrl(this.getAttr(linkEl, 'href'), 'https://www.aliexpress.com');
        products.push({ id: this.generateId(), itemNumber: itemNumber++, marketplace: this.marketplace,
          title: title.substring(0, 200), imageUrl, price, rating, reviews, description, shipping, page, url, searchKeywords, timestamp: Date.now() });
      } catch { /* skip */ }
    }
    return products;
  }
}