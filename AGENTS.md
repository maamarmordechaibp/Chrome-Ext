# Repository guide for AI agents

Marketplace Catalog Generator — a Manifest V3 Chrome extension that scans
supported marketplace search results and produces branded, printable PDF
catalogs with per-item lookup by Catalog ID + item number.

## Golden rules for changes

- **Never generate very large files.** Keep source files under ~400–500 lines.
  Split UI into focused components and extract pure logic into small modules.
- **One feature per change/branch/phase.** Each completed phase must compile
  (`npm run build`), pass linting, and pass tests (`npm run test`) before moving on.
- **Shared interfaces and types live in [`src/types/index.ts`](src/types/index.ts).**
  Do not redefine domain types locally.
- **Add tests when you touch a parser.** Capture an HTML snapshot into
  `tests/fixtures/<name>.html` and assert extracted fields in
  [`tests/parsers.test.ts`](tests/parsers.test.ts).
- **Do not add features, refactors, or abstractions beyond what was requested.**

## Architecture

- `src/parsers/` — one `BaseParser` subclass per marketplace. Parsers are pure
  DOM readers: `extractPageInfo`, `extractProducts(doc, kw, page, start)`, and
  `getNextPage` (pagination). They must never touch `chrome.*`.
- `src/content/content.ts` — runs in the page; routes messages to the parser.
- `src/background/background.ts` — service worker; fetches images, opens items.
- `src/storage/` — `Database.ts` (IndexedDB: catalogs, images, PDFs) and
  `StorageManager.ts` (settings in `chrome.storage.local`, catalogs via IndexedDB,
  catalog-ID generation, favorites, item lookup).
- `src/popup/` — React UI. `crawler.ts` orchestrates multi-page scanning;
  `imageUtil.ts` builds thumbnails; components live in `components/`.
- `src/pdf/PDFGenerator.ts` — jsPDF layout and branding.

## Commands

- `npm run build` — production build into `dist/`.
- `npm run dev` — watch build.
- `npm run test` — run the parser regression harness (vitest + jsdom).

## Data model notes

- Catalog IDs are human-readable: `CAT-YYYYMMDD-NNNNNN`.
- Item lookup requires **both** Catalog ID and item number (numbers are only
  unique within a single catalog).
- Heavy data (catalogs, cached images, PDFs) is stored in IndexedDB; only small
  settings/preferences use `chrome.storage.local`.
