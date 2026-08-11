import { BaseParser } from './BaseParser';
import { AmazonParser } from './AmazonParser';
import { EbayParser } from './EbayParser';
import { WalmartParser } from './WalmartParser';
import { AliExpressParser } from './AliExpressParser';
import { TargetParser } from './TargetParser';
import { MacysParser } from './MacysParser';
import { CostcoParser } from './CostcoParser';
import { HomeDepotParser } from './HomeDepotParser';
import { BestBuyParser } from './BestBuyParser';
import { LowesParser } from './LowesParser';
import { WayfairParser } from './WayfairParser';
import { EtsyParser } from './EtsyParser';
import { GenericStoreParser } from './GenericStoreParser';
import { STORE_CONFIGS } from './storeConfigs';
import { Marketplace } from '../types';

class ParserRegistry {
  private readonly parsers: BaseParser[] = [
    new AmazonParser(), new EbayParser(), new WalmartParser(), new AliExpressParser(),
    new TargetParser(), new MacysParser(), new CostcoParser(), new HomeDepotParser(),
    new BestBuyParser(), new LowesParser(), new WayfairParser(), new EtsyParser(),
    ...STORE_CONFIGS.map((cfg) => new GenericStoreParser(cfg)),
  ];
  getParser(url: string): BaseParser | null { return this.parsers.find((p) => p.matches(url)) ?? null; }
  isSupported(url: string): boolean { return this.parsers.some((p) => p.matches(url)); }
  getMarketplaceName(url: string): Marketplace { return this.getParser(url)?.marketplace ?? 'Unknown'; }
}
export const parserRegistry = new ParserRegistry();