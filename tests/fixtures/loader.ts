import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Loads a saved HTML snapshot into a DOM Document with a realistic URL so that
 * parsers behave exactly as they would on the live marketplace page.
 */
export function loadFixture(name: string, url: string): Document {
  const html = readFileSync(resolve(here, `${name}.html`), 'utf8');
  const dom = new JSDOM(html, { url });
  return dom.window.document as unknown as Document;
}
