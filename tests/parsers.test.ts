import { describe, it, expect } from 'vitest';
import { AmazonParser } from '../src/parsers/AmazonParser';
import { EbayParser } from '../src/parsers/EbayParser';
import { WalmartParser } from '../src/parsers/WalmartParser';
import { AliExpressParser } from '../src/parsers/AliExpressParser';
import { loadFixture } from './fixtures/loader';

/**
 * Parser regression harness.
 *
 * Each test loads a saved HTML snapshot and asserts that the parser still
 * extracts the expected fields. When a marketplace changes its markup, capture a
 * fresh snapshot into tests/fixtures/<name>.html and update the expectations —
 * a failing test here pinpoints exactly which selector broke.
 */

describe('AmazonParser', () => {
  const parser = new AmazonParser();
  const doc = loadFixture('amazon', 'https://www.amazon.com/s?k=wireless+headphones');

  it('reads page info', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.marketplace).toBe('Amazon');
    expect(info.searchKeywords).toBe('wireless headphones');
    expect(info.currentPage).toBe(1);
    expect(info.totalPages).toBe(3);
  });

  it('extracts products with prices and ratings', () => {
    const products = parser.extractProducts(doc, 'wireless headphones', 1, 1);
    expect(products.length).toBe(2);
    const [first] = products;
    expect(first.itemNumber).toBe(1);
    expect(first.title).toContain('Sony WH-1000XM4');
    expect(first.price).toBe('$248.00');
    expect(first.originalPrice).toBe('$349.99');
    expect(first.rating).toBe('4.7');
    expect(first.isPrime).toBe(true);
    expect(first.url).toContain('/dp/A1');
    expect(first.description).toContain('Noise Cancelling');
  });

  it('continues item numbering from a start offset', () => {
    const products = parser.extractProducts(doc, 'wireless headphones', 1, 25);
    expect(products[0].itemNumber).toBe(25);
    expect(products[1].itemNumber).toBe(26);
  });

  it('builds the next page URL', () => {
    const next = parser.getNextPage(doc);
    expect(next.url).toContain('page=2');
  });
});

describe('EbayParser', () => {
  const parser = new EbayParser();
  const doc = loadFixture('ebay', 'https://www.ebay.com/sch/i.html?_nkw=iphone+12');

  it('reads page info and skips the placeholder item', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('iphone 12');
    expect(info.totalPages).toBe(3);
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('iPhone 12');
    expect(products[0].price).toBe('$299.99');
    expect(products[0].url).toContain('/itm/111');
    expect(products[0].description).toContain('Excellent condition');
  });

  it('builds the next page URL', () => {
    expect(parser.getNextPage(doc).url).toContain('_pgn=2');
  });
});

describe('EbayParser (new s-card layout)', () => {
  const parser = new EbayParser();
  const doc = loadFixture('ebay-new', 'https://www.ebay.com/sch/i.html?_nkw=iphone+12');

  it('extracts products from the redesigned card grid', () => {
    const products = parser.extractProducts(doc, 'iphone 12', 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('iPhone 12');
    expect(products[0].price).toBe('$299.99');
    expect(products[0].url).toContain('/itm/111');
    expect(products[0].availability).toBe('Pre-Owned');
    expect(products[0].seller).toContain('techdeals');
    expect(products[1].originalPrice).toBe('$399.00');
  });
});

describe('WalmartParser', () => {
  const parser = new WalmartParser();
  const doc = loadFixture('walmart', 'https://www.walmart.com/search?q=bath+towel');

  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('bath towel');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Bath Towel');
    expect(products[0].price).toBe('$5.98');
    expect(products[0].url).toContain('/ip/');
    expect(products[0].description).toContain('100% Cotton');
  });

  it('builds the next page URL when total pages are unknown', () => {
    expect(parser.getNextPage(doc).url).toContain('page=2');
  });
});

describe('AliExpressParser', () => {
  const parser = new AliExpressParser();
  const doc = loadFixture('aliexpress', 'https://www.aliexpress.com/wholesale?SearchText=bluetooth+speaker');

  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('bluetooth speaker');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Bluetooth Speaker');
    expect(products[0].price).toContain('12.34');
    expect(products[0].url).toContain('/item/333');
    expect(products[0].description).toContain('Waterproof');
  });

  it('builds the next page URL', () => {
    expect(parser.getNextPage(doc).url).toContain('page=2');
  });
});

describe('Detail pages', () => {
  it('Amazon captures full product detail', () => {
    const parser = new AmazonParser();
    const doc = loadFixture('amazon-detail', 'https://www.amazon.com/dp/B0863TXGM3');
    expect(parser.isDetailPage(doc)).toBe(true);
    expect(parser.getPageType(doc)).toBe('detail');
    const d = parser.extractDetail(doc)!;
    expect(d).not.toBeNull();
    expect(d.title).toContain('Sony WH-1000XM4');
    expect(d.brand).toBe('Sony');
    expect(d.price).toBe('$248.00');
    expect(d.originalPrice).toBe('$349.99');
    expect(d.rating).toBe('4.6');
    expect(d.reviews).toBe('1,234');
    expect(d.availability).toContain('In Stock');
    expect(d.features.length).toBe(2);
    expect(d.specs.length).toBeGreaterThanOrEqual(3);
    expect(d.specs[0]).toEqual({ label: 'Brand', value: 'Sony' });
    expect(d.images.length).toBeGreaterThanOrEqual(2);
    expect(d.images[0]).not.toMatch(/_AC_/);
    const color = d.variants.find((v) => v.name === 'Color');
    expect(color?.options.map((o) => o.label)).toContain('Black');
  });

  it('eBay captures item detail and specifics', () => {
    const parser = new EbayParser();
    const doc = loadFixture('ebay-detail', 'https://www.ebay.com/itm/123456789');
    expect(parser.isDetailPage(doc)).toBe(true);
    const d = parser.extractDetail(doc)!;
    expect(d.title).toContain('iPhone 12');
    expect(d.price).toBe('$299.99');
    expect(d.seller).toBe('techdeals_store');
    expect(d.specs.length).toBeGreaterThanOrEqual(2);
    expect(d.specs.find((s) => s.label === 'Storage Capacity')?.value).toBe('64 GB');
    expect(d.images.length).toBeGreaterThanOrEqual(1);
    expect(d.images[0]).toContain('s-l1600');
    expect(d.variants[0].options.map((o) => o.label)).toContain('Black');
  });

  it('Walmart captures product detail', () => {
    const parser = new WalmartParser();
    const doc = loadFixture('walmart-detail', 'https://www.walmart.com/ip/Bath-Towel/123');
    expect(parser.isDetailPage(doc)).toBe(true);
    const d = parser.extractDetail(doc)!;
    expect(d.title).toContain('Bath Towel');
    expect(d.brand).toBe('Mainstays');
    expect(d.price).toBe('$5.98');
    expect(d.originalPrice).toBe('$8.98');
    expect(d.rating).toBe('4.5');
    expect(d.features.length).toBeGreaterThanOrEqual(2);
    expect(d.specs.length).toBeGreaterThanOrEqual(3);
    expect(d.images.length).toBeGreaterThanOrEqual(1);
    expect(d.images[0]).not.toContain('?');
    expect(d.variants[0].options.map((o) => o.label)).toContain('White');
  });

  it('AliExpress captures item detail', () => {
    const parser = new AliExpressParser();
    const doc = loadFixture('aliexpress-detail', 'https://www.aliexpress.com/item/333.html');
    expect(parser.isDetailPage(doc)).toBe(true);
    const d = parser.extractDetail(doc)!;
    expect(d.title).toContain('Bluetooth Speaker');
    expect(d.price).toContain('12.34');
    expect(d.rating).toBe('4.8');
    expect(d.specs.length).toBeGreaterThanOrEqual(2);
    expect(d.specs.find((s) => s.label === 'Waterproof')?.value).toBe('IPX7');
    expect(d.images.length).toBeGreaterThanOrEqual(1);
    expect(d.images[0]).not.toContain('_220x220');
    expect(d.variants[0].options.map((o) => o.label)).toContain('Black');
  });

  it('search pages are not treated as detail pages', () => {
    const parser = new AmazonParser();
    const searchDoc = loadFixture('amazon', 'https://www.amazon.com/s?k=wireless+headphones');
    expect(parser.isDetailPage(searchDoc)).toBe(false);
    expect(parser.getPageType(searchDoc)).toBe('search');
  });
});

