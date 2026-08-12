import { Marketplace } from '../types';

/** Builds a fresh search-results URL from keywords for a marketplace. */
type SearchBuilder = (keywords: string) => string;

function q(base: string, param: string, keywords: string): string {
  const u = new URL(base);
  u.searchParams.set(param, keywords);
  return u.href;
}

/** Known search endpoints for the fully-supported marketplaces. Pagination is
 *  added later by each parser's {@link BaseParser.getNextPage}, so these only
 *  need to land on the first results page. */
const BUILDERS: Partial<Record<Marketplace, SearchBuilder>> = {
  Amazon: (k) => q('https://www.amazon.com/s', 'k', k),
  eBay: (k) => q('https://www.ebay.com/sch/i.html', '_nkw', k),
  Walmart: (k) => q('https://www.walmart.com/search', 'q', k),
  AliExpress: (k) => q('https://www.aliexpress.com/wholesale', 'SearchText', k),
  Target: (k) => q('https://www.target.com/s', 'searchTerm', k),
  "Macy's": (k) => q('https://www.macys.com/shop/search', 'keyword', k),
  Costco: (k) => q('https://www.costco.com/CatalogSearch', 'keyword', k),
  'Home Depot': (k) => `https://www.homedepot.com/s/${encodeURIComponent(k)}`,
  'Best Buy': (k) => q('https://www.bestbuy.com/site/searchpage.jsp', 'st', k),
  "Lowe's": (k) => q('https://www.lowes.com/search', 'searchTerm', k),
  Wayfair: (k) => q('https://www.wayfair.com/keyword.php', 'keyword', k),
  Etsy: (k) => q('https://www.etsy.com/search', 'q', k),
};

/** Marketplaces the background job can search on their own. */
export const SEARCHABLE_MARKETPLACES = Object.keys(BUILDERS) as Marketplace[];

/** Returns a search URL for the marketplace, or null when its endpoint is
 *  unknown (the job then skips that marketplace). */
export function buildSearchUrl(marketplace: Marketplace, keywords: string): string | null {
  const kw = keywords.trim();
  if (!kw) return null;
  const build = BUILDERS[marketplace];
  return build ? build(kw) : null;
}
