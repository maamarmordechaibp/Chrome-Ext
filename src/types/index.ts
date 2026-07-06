export type Marketplace = 'Amazon' | 'Walmart' | 'eBay' | 'AliExpress' | 'Unknown';

/** How many result pages to scan when generating a catalog. */
export type CrawlMode = 'current' | 'first' | 'all';

/** Whether the current tab is a search-results page or a single-product page. */
export type PageType = 'search' | 'detail' | 'unsupported';

export interface Product {
  id: string; itemNumber: number; marketplace: Marketplace;
  title: string; imageUrl: string; imageBase64?: string;
  price: string; originalPrice?: string; discount?: string;
  rating?: string; reviews?: string; seller?: string; brand?: string;
  shipping?: string; availability?: string; isPrime?: boolean; isSponsored?: boolean;
  /** Short descriptive line (subtitle / condition / key detail) shown under the title. */
  description?: string;
  page: number; url: string; searchKeywords: string; timestamp: number;
}
export interface PageInfo {
  marketplace: Marketplace; searchKeywords: string;
  currentPage: number; totalPages?: number; isSupported: boolean; url: string;
  /** 'search' = results list, 'detail' = single product page, 'unsupported' otherwise. */
  pageType?: PageType;
}

/** A single size/color/style option, with its own price when the site shows one. */
export interface VariantOption { label: string; price?: string; }
/** A group of variants (e.g. "Size", "Color") and its selectable options. */
export interface VariantGroup { name: string; options: VariantOption[]; }
/** One key/value row from a product's specifications table. */
export interface SpecRow { label: string; value: string; }

/** Rich data captured from a single product's detail page. */
export interface ProductDetail {
  marketplace: Marketplace;
  title: string; brand?: string; url: string;
  price: string; originalPrice?: string; discount?: string;
  rating?: string; reviews?: string; availability?: string; seller?: string; shipping?: string;
  description?: string;
  /** Every product image found on the page (deduped, upgraded resolution). */
  images: string[];
  /** Fetched base64 versions of {@link images}, filled in before PDF generation. */
  imagesBase64?: string[];
  /** Bullet-point highlights ("About this item"). */
  features: string[];
  /** Specifications / technical details table rows. */
  specs: SpecRow[];
  /** Size / color / style option groups. */
  variants: VariantGroup[];
  timestamp: number;
}
export interface DetailResult { success: boolean; detail: ProductDetail | null; error?: string; }
export interface ExtractResult { success: boolean; products: Product[]; pageInfo: PageInfo; error?: string; }
export interface NextPageInfo { url: string | null; currentPage: number; totalPages?: number; }


/** Options controlling multi-page crawling. */
export interface CrawlOptions { mode: CrawlMode; maxPages: number; }

export interface ItemMapping {
  itemNumber: number; url: string; page: number; marketplace: Marketplace;
  timestamp: number; title: string; imageUrl?: string;
}
export interface CatalogRecord {
  /** Human-readable identifier, e.g. CAT-20260706-000123. */
  id: string; marketplace: Marketplace; searchKeywords: string;
  generationDate: number; productCount: number; pageCount: number;
  customerName?: string; representative?: string; notes?: string;
  /** Small base64 thumbnail (first product image) for history previews. */
  thumbnail?: string; favorite?: boolean; hasPdf?: boolean;
  itemMappings: ItemMapping[];
}

/** Branding + context passed to the PDF generator. */
export interface CatalogMeta {
  catalogId: string; marketplace: Marketplace; searchKeywords: string; timestamp: number;
  companyName: string; companyLogo?: string; showLogo: boolean;
  customerName?: string; representative?: string;
}

export interface Settings {
  productsPerRow: 1 | 2 | 3; rowsPerPage: 2 | 3 | 4;
  showRatings: boolean; showReviews: boolean; showDiscounts: boolean;
  showShipping: boolean; showSeller: boolean; showQRCode: boolean; showProductURL: boolean;
  showBrand: boolean; showDescription: boolean;
  hidePeople: boolean;
  companyName: string;
  companyLogo?: string; showLogo: boolean;
  defaultCustomerName: string; defaultRepresentative: string;
  /** First item number printed on the pictures (e.g. 1001). Lookup uses this. */
  startItemNumber: number;
  crawlMode: CrawlMode; maxPages: number;
}

export type MessageType =
  | 'EXTRACT_PRODUCTS' | 'GET_PAGE_INFO' | 'GET_NEXT_PAGE'
  | 'EXTRACT_DETAIL'
  | 'FETCH_IMAGES_BATCH' | 'OPEN_ITEM';
export interface MessageRequest<T = unknown> { type: MessageType; payload?: T; }
export interface MessageResponse<T = unknown> { success: boolean; data?: T; error?: string; }

/** A representative's account profile stored in Firestore under `users/{uid}`. */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  /** The team this rep belongs to; scopes all catalog access. */
  teamId: string;
  role: 'owner' | 'member';
  createdAt: number;
}

/** A team/company. All catalogs are scoped to a team so any rep on the team can
 *  see any catalog. Stored in Firestore under `teams/{teamId}`. */
export interface Team {
  id: string;
  name: string;
  /** Short human-friendly code new reps enter to join this team. */
  joinCode: string;
  ownerUid: string;
  createdAt: number;
}
