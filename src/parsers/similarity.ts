import { JobSourceItem, Product } from '../types';

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'by',
  'new', 'set', 'pack', 'size', 'color', 'pcs', 'piece',
]);

/** Splits a product title into lowercase, de-noised tokens for comparison. */
function tokenize(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
  return new Set(tokens);
}

/** Jaccard overlap of two titles' token sets, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Parses the first currency amount in a price string, or null. */
function parsePrice(price?: string): number | null {
  if (!price) return null;
  const m = price.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Price proximity score, 0–1. 1 when equal, decaying with relative distance.
 *  Returns a neutral 0.5 when either price is missing. */
export function priceCloseness(a?: string, b?: string): number {
  const pa = parsePrice(a);
  const pb = parsePrice(b);
  if (pa === null || pb === null) return 0.5;
  const hi = Math.max(pa, pb);
  if (hi === 0) return 1;
  const rel = Math.abs(pa - pb) / hi;
  return Math.max(0, 1 - rel);
}

/** Combined similarity of a candidate product to a source item (0–1),
 *  weighting title match over price proximity. */
export function scoreCandidate(source: JobSourceItem, candidate: Product): number {
  const title = titleSimilarity(source.title, candidate.title);
  const price = priceCloseness(source.price, candidate.price);
  return title * 0.8 + price * 0.2;
}

/** Picks the best-matching candidates for a source item above a minimum score. */
export function rankSimilar(
  source: JobSourceItem,
  candidates: Product[],
  topN = 3,
  minScore = 0.15,
): Product[] {
  return candidates
    .map((c) => ({ c, s: scoreCandidate(source, c) }))
    .filter((x) => x.s >= minScore)
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
    .map((x) => x.c);
}
