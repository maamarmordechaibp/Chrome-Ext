import { BaseParser } from './BaseParser';
import { AmazonParser } from './AmazonParser';
import { EbayParser } from './EbayParser';
import { WalmartParser } from './WalmartParser';
import { AliExpressParser } from './AliExpressParser';
import { Marketplace } from '../types';

class ParserRegistry {
  private readonly parsers: BaseParser[] = [
    new AmazonParser(), new EbayParser(), new WalmartParser(), new AliExpressParser(),
  ];
  getParser(url: string): BaseParser | null { return this.parsers.find((p) => p.matches(url)) ?? null; }
  isSupported(url: string): boolean { return this.parsers.some((p) => p.matches(url)); }
  getMarketplaceName(url: string): Marketplace { return this.getParser(url)?.marketplace ?? 'Unknown'; }
}
export const parserRegistry = new ParserRegistry();