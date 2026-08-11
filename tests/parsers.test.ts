import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { AmazonParser } from '../src/parsers/AmazonParser';
import { EbayParser } from '../src/parsers/EbayParser';
import { WalmartParser } from '../src/parsers/WalmartParser';
import { AliExpressParser } from '../src/parsers/AliExpressParser';
import { TargetParser } from '../src/parsers/TargetParser';
import { MacysParser } from '../src/parsers/MacysParser';
import { CostcoParser } from '../src/parsers/CostcoParser';
import { HomeDepotParser } from '../src/parsers/HomeDepotParser';
import { BestBuyParser } from '../src/parsers/BestBuyParser';
import { LowesParser } from '../src/parsers/LowesParser';
import { WayfairParser } from '../src/parsers/WayfairParser';
import { EtsyParser } from '../src/parsers/EtsyParser';
import { GenericStoreParser } from '../src/parsers/GenericStoreParser';
import { STORE_CONFIGS } from '../src/parsers/storeConfigs';
import { parserRegistry } from '../src/parsers/ParserRegistry';
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

  it('captures the URL when the link wraps the h2 (title-recipe layout)', () => {
    // Newer Amazon layout: <div data-cy="title-recipe"><a href><h2><span>…
    // The title matches but the link is an ANCESTOR of the h2, not a descendant.
    const html = `<div data-component-type="s-search-result" data-asin="B0TEST">
      <div data-cy="title-recipe">
        <a class="a-link-normal" href="/TEEHAY-Water-Filter/dp/B0TEST/ref=sr_1_1">
          <h2><span>TEEHAY EDR1RXD1 Water Filter</span></h2>
        </a>
      </div>
      <img class="s-image" src="https://m.media-amazon.com/images/x.jpg" />
    </div>`;
    const d = new JSDOM(html, { url: 'https://www.amazon.com/s?k=water+filter' })
      .window.document as unknown as Document;
    const products = new AmazonParser().extractProducts(d, 'water filter', 1, 1);
    expect(products.length).toBe(1);
    expect(products[0].title).toContain('TEEHAY');
    expect(products[0].url).toContain('/dp/B0TEST');
    expect(products[0].url).toMatch(/^https:\/\/www\.amazon\.com\//);
  });

  it('skips javascript:void(0) placeholder links and uses the real /dp/ link', () => {
    const html = `<div data-component-type="s-search-result" data-asin="B0JS">
      <div data-cy="title-recipe">
        <a class="a-link-normal" href="javascript:void(0)"><h2><span>Placeholder Product</span></h2></a>
      </div>
      <a class="a-link-normal s-no-outline" href="/Placeholder-Product/dp/B0JS/ref=sr_1_1"></a>
      <img class="s-image" src="https://m.media-amazon.com/images/y.jpg" />
    </div>`;
    const d = new JSDOM(html, { url: 'https://www.amazon.com/s?k=x' })
      .window.document as unknown as Document;
    const products = new AmazonParser().extractProducts(d, 'x', 1, 1);
    expect(products.length).toBe(1);
    expect(products[0].url).toContain('/dp/B0JS');
    expect(products[0].url).not.toContain('javascript');
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

  it('separates tiles when each product has two links (image + title) and no data-item-id', () => {
    // Modern Walmart grid: no data-item-id, each tile wraps TWO links to the same
    // /ip/ product (image + title). The parser must still yield one row per product.
    const html = `<div class="grid">
      <div class="tile">
        <a href="/ip/Wall-Clock/111111"><img src="https://i5.walmartimages.com/asr/clock.jpg" alt="Wall Clock" /></a>
        <a href="/ip/Wall-Clock/111111"><span class="w_iUH7">Modern Wall Clock 12 inch</span></a>
        <div><span>current price</span><span>$18.97</span></div>
      </div>
      <div class="tile">
        <a href="/ip/Desk-Lamp/222222"><img src="https://i5.walmartimages.com/asr/lamp.jpg" alt="Desk Lamp" /></a>
        <a href="/ip/Desk-Lamp/222222"><span class="w_iUH7">LED Desk Lamp Adjustable</span></a>
        <div><span>current price</span><span>$24.50</span></div>
      </div>
    </div>`;
    const d = new JSDOM(html, { url: 'https://www.walmart.com/search?q=home' })
      .window.document as unknown as Document;
    const products = new WalmartParser().extractProducts(d, 'home', 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Wall Clock');
    expect(products[0].price).toBe('$18.97');
    expect(products[0].url).toContain('/ip/Wall-Clock/111111');
    expect(products[1].title).toContain('Desk Lamp');
    expect(products[1].price).toBe('$24.50');
  });

  it('reads the real cents price, not the split visual "$3761"', () => {
    // Walmart shows the price twice: an accessible "current price $37.61" node and
    // a visual split ("$37" superscript "61") that reads back as "$3761". The
    // parser must pick the cents form so the PDF never shows "$3761".
    const html = `<div class="grid">
      <div class="tile">
        <a href="/ip/Work-Light/998877"><img src="https://i5.walmartimages.com/asr/light.jpg" alt="Work Light" /></a>
        <a href="/ip/Work-Light/998877"><span class="w_iUH7">LED Work Light</span></a>
        <div data-automation-id="product-price">
          <span class="w_iUH7">current price $37.61</span>
          <div aria-hidden="true"><span>$</span><span>37</span><span>61</span></div>
        </div>
      </div>
    </div>`;
    const d = new JSDOM(html, { url: 'https://www.walmart.com/search?q=light' })
      .window.document as unknown as Document;
    const products = new WalmartParser().extractProducts(d, 'light', 1, 1);
    expect(products.length).toBe(1);
    expect(products[0].price).toBe('$37.61');
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

  it('captures lazy-loaded images from data-src (not the placeholder)', () => {
    // AliExpress ships a data: placeholder in src and the real image in data-src.
    const html = `<div class="list--gallery--C2f2tvm">
      <div class="search-item-card-wrapper-gallery">
        <a href="/item/1005006999.html"><div class="title--abc">Mini Speaker</div></a>
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
             data-src="//ae01.alicdn.com/kf/S1234abcd.jpg" />
        <div class="price--xyz">$9.99</div>
      </div>
    </div>`;
    const d = new JSDOM(html, { url: 'https://www.aliexpress.com/wholesale?SearchText=speaker' })
      .window.document as unknown as Document;
    const products = new AliExpressParser().extractProducts(d, 'speaker', 1, 1);
    expect(products.length).toBe(1);
    expect(products[0].imageUrl).toBe('https://ae01.alicdn.com/kf/S1234abcd.jpg');
    expect(products[0].imageUrl.startsWith('data:')).toBe(false);
    expect(products[0].url).toContain('/item/1005006999');
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

describe('TargetParser', () => {
  const parser = new TargetParser();
  const doc = loadFixture('target', 'https://www.target.com/s?searchTerm=water+bottle');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('water bottle');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Water Bottle');
    expect(products[0].price).toBe('$19.99');
    expect(products[0].brand).toBe('Simple Modern');
    expect(products[0].url).toContain('/A-54211678');
    expect(products[1].price).toBe('$24.00');
  });
});

describe('HomeDepotParser', () => {
  const parser = new HomeDepotParser();
  const doc = loadFixture('homedepot', 'https://www.homedepot.com/b/search?keyword=drill');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('drill');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Drill');
    expect(products[0].price).toBe('$99.00');
    expect(products[0].brand).toBe('RYOBI');
    expect(products[0].url).toContain('/p/');
    expect(products[1].price).toBe('$149.97');
  });
});

describe('BestBuyParser', () => {
  const parser = new BestBuyParser();
  const doc = loadFixture('bestbuy', 'https://www.bestbuy.com/site/searchpage.jsp?st=headphones');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('headphones');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('WH-1000XM5');
    expect(products[0].price).toBe('$399.99');
    expect(products[0].url).toContain('6505727.p');
    expect(products[1].price).toBe('$549.99');
  });
});

describe('MacysParser', () => {
  const parser = new MacysParser();
  const doc = loadFixture('macys', 'https://www.macys.com/shop/featured/polo?keyword=polo');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('polo');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Polo Shirt');
    expect(products[0].brand).toContain('Ralph Lauren');
    expect(products[0].price).toBe('$89.50');
    expect(products[0].originalPrice).toBe('$110.00');
    expect(products[0].url).toContain('ID=12345678');
  });
});

describe('CostcoParser', () => {
  const parser = new CostcoParser();
  const doc = loadFixture('costco', 'https://www.costco.com/CatalogSearch?keyword=olive+oil');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('olive oil');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Olive Oil');
    expect(products[0].price).toBe('$21.99');
    expect(products[0].url).toContain('.product.100234567.html');
    expect(products[1].price).toBe('$499.99');
  });
});

describe('LowesParser', () => {
  const parser = new LowesParser();
  const doc = loadFixture('lowes', 'https://www.lowes.com/search?searchTerm=tool+bag');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('tool bag');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Tool Bag');
    expect(products[0].brand).toBe('Kobalt');
    expect(products[0].price).toBe('$34.98');
    expect(products[0].url).toContain('/pd/');
    expect(products[1].price).toBe('$79.00');
  });
});

describe('WayfairParser', () => {
  const parser = new WayfairParser();
  const doc = loadFixture('wayfair', 'https://www.wayfair.com/keyword.php?keyword=accent+chair');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('accent chair');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Accent Chair');
    expect(products[0].price).toBe('$189.99');
    expect(products[0].originalPrice).toBe('$249.99');
    expect(products[0].url).toContain('/pdp/');
    expect(products[1].price).toBe('$74.99');
  });
});

describe('EtsyParser', () => {
  const parser = new EtsyParser();
  const doc = loadFixture('etsy', 'https://www.etsy.com/search?q=leather+wallet');
  it('extracts products', () => {
    const info = parser.extractPageInfo(doc);
    expect(info.searchKeywords).toBe('leather wallet');
    const products = parser.extractProducts(doc, info.searchKeywords, 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Leather Wallet');
    expect(products[0].price).toBe('$32.00');
    expect(products[0].seller).toBe('LeatherCraftCo');
    expect(products[0].url).toContain('/listing/1234567890');
    expect(products[1].price).toBe('$24.50');
  });
});

describe('GenericStoreParser', () => {
  const generic = (mp: string) =>
    new GenericStoreParser(STORE_CONFIGS.find((c) => c.marketplace === mp)!);

  it('extracts Newegg-style tiles with custom selectors', () => {
    const html = `<div class="list">
      <div class="item-cell">
        <a class="item-title" href="/p/N82E16819113567">Intel Core i7 Processor</a>
        <img src="https://c1.neweggimages.com/cpu.jpg" alt="cpu" />
        <li class="price-current">$299.99</li>
      </div>
      <div class="item-cell">
        <a class="item-title" href="/p/N82E16820147xyz">Samsung SSD 1TB</a>
        <img src="https://c1.neweggimages.com/ssd.jpg" alt="ssd" />
        <li class="price-current">$89.99</li>
      </div>
    </div>`;
    const doc = new JSDOM(html, { url: 'https://www.newegg.com/p/pl?d=cpu' })
      .window.document as unknown as Document;
    const parser = generic('Newegg');
    expect(parser.extractPageInfo(doc).searchKeywords).toBe('cpu');
    const products = parser.extractProducts(doc, 'cpu', 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Intel Core i7');
    expect(products[0].price).toBe('$299.99');
    expect(products[0].url).toContain('/p/N82E16819113567');
    expect(products[1].price).toBe('$89.99');
  });

  it('discovers tiles via product links with default selectors (Kohl\'s)', () => {
    const html = `<ul>
      <li class="products">
        <a class="product-title" href="/product/prd-1234567/nike-shoes.jsp">Nike Running Shoes</a>
        <img src="https://media.kohls.com/nike.jpg" alt="nike" />
        <span class="price">$79.99</span>
      </li>
      <li class="products">
        <a class="product-title" href="/product/prd-7654321/adidas.jsp">Adidas Sneakers</a>
        <img src="https://media.kohls.com/adidas.jpg" alt="adidas" />
        <span class="price">$64.99</span>
      </li>
    </ul>`;
    const doc = new JSDOM(html, { url: 'https://www.kohls.com/search.jsp?search=shoes' })
      .window.document as unknown as Document;
    const parser = generic("Kohl's");
    const products = parser.extractProducts(doc, 'shoes', 1, 1);
    expect(products.length).toBe(2);
    expect(products[0].title).toContain('Nike');
    expect(products[0].price).toBe('$79.99');
    expect(products[0].url).toContain('/product/prd-1234567');
    expect(products[1].url).toContain('/product/prd-7654321');
  });

  it('routes new store hosts to a parser and detects detail pages', () => {
    expect(parserRegistry.getMarketplaceName('https://www.newegg.com/p/pl?d=gpu')).toBe('Newegg');
    expect(parserRegistry.getMarketplaceName('https://www.nordstrom.com/sr?keyword=boots')).toBe('Nordstrom');
    expect(parserRegistry.getMarketplaceName('https://www.bhphotovideo.com/c/search?q=lens')).toBe('B&H Photo');
    const detailDoc = new JSDOM('<h1>Item</h1>', { url: 'https://www.newegg.com/p/N82E16819113567' })
      .window.document as unknown as Document;
    expect(parserRegistry.getParser('https://www.newegg.com/p/x')!.isDetailPage(detailDoc)).toBe(true);
  });
});

