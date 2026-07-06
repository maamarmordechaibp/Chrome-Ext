import { jsPDF } from 'jspdf';
import { ProductDetail, Settings, CatalogMeta } from '../types';
import { CODELAB_LOGO } from './brand';
import { PW, PH, M, MC, drawStars } from './draw';

const HEADER_H = 0.62; const FOOTER_H = 0.34;
const CONTENT_TOP = M + HEADER_H + 0.1;
const CONTENT_BOTTOM = PH - FOOTER_H - 0.12;
const CW = PW - M * 2;

/**
 * Renders a single product's detail page as a branded "spec sheet" PDF:
 * a hero image + gallery, price/rating, variants, feature highlights and a
 * full specifications table — everything captured from the product page.
 */
export class DetailPDFGenerator {
  private doc!: jsPDF;
  private meta!: CatalogMeta;
  private y = CONTENT_TOP;

  async generate(detail: ProductDetail, _settings: Settings, meta: CatalogMeta): Promise<Blob> {
    this.doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
    this.meta = meta;
    // jsPDF's default pen is 0.2in wide; use a crisp hairline for all strokes.
    this.doc.setLineWidth(0.01);
    this.addHeader();
    this.y = CONTENT_TOP;

    this.drawHero(detail);
    this.drawGallery(detail);
    this.drawVariants(detail);
    this.drawFeatures(detail);
    this.drawSpecs(detail);
    this.drawOrderButton(detail);

    this.addFooter();
    return this.doc.output('blob');
  }

  /** Advances the cursor, adding a new page (with header/footer) when needed. */
  private ensure(space: number): void {
    if (this.y + space <= CONTENT_BOTTOM) return;
    this.addFooter();
    this.doc.addPage();
    this.addHeader();
    this.y = CONTENT_TOP;
  }

  private drawHero(d: ProductDetail): void {
    const imgW = 3.2; const imgH = 3.2; const gap = 0.25;
    const infoX = M + imgW + gap; const infoW = CW - imgW - gap;
    // Image box
    this.doc.setFillColor(255, 255, 255); this.doc.setDrawColor(230, 230, 233);
    this.doc.roundedRect(M, this.y, imgW, imgH, 0.05, 0.05, 'FD');
    const main = d.imagesBase64?.[0];
    if (main) this.fitImage(main, M, this.y, imgW, imgH);
    else this.noImage(M, this.y, imgW, imgH);
    if (d.url) this.doc.link(M, this.y, imgW, imgH, { url: d.url });

    // Info column
    let iy = this.y + 0.1;
    // Marketplace badge
    const mc = MC[d.marketplace] ?? MC.Unknown;
    this.doc.setFillColor(...mc); this.doc.roundedRect(infoX, iy, 0.9, 0.2, 0.03, 0.03, 'F');
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(8); this.doc.setTextColor(255, 255, 255);
    this.doc.text(d.marketplace, infoX + 0.45, iy + 0.14, { align: 'center' });
    iy += 0.34;

    // Title
    this.doc.setTextColor(25, 25, 25); this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(12);
    const titleLines = (this.doc.splitTextToSize(d.title, infoW) as string[]).slice(0, 5);
    this.doc.text(titleLines, infoX, iy + 0.13); iy += titleLines.length * 0.19 + 0.06;

    // Brand
    if (d.brand) {
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(8.5); this.doc.setTextColor(90, 90, 160);
      this.doc.text(`Brand: ${d.brand}`, infoX, iy); iy += 0.2;
    }
    // Price row
    if (d.price) {
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(16); this.doc.setTextColor(190, 30, 30);
      this.doc.text(d.price, infoX, iy + 0.02);
      let px = infoX + this.doc.getTextWidth(d.price) + 0.12;
      if (d.originalPrice) {
        this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(9); this.doc.setTextColor(150, 150, 150);
        this.doc.text(d.originalPrice, px, iy);
        const ow = this.doc.getTextWidth(d.originalPrice);
        this.doc.setDrawColor(150, 150, 150); this.doc.line(px, iy - 0.03, px + ow, iy - 0.03);
        px += ow + 0.1;
      }
      if (d.discount) {
        this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9); this.doc.setTextColor(30, 150, 30);
        this.doc.text(d.discount, px, iy);
      }
      iy += 0.28;
    }
    // Rating
    const rv = d.rating ? parseFloat(d.rating) : NaN;
    if (!isNaN(rv) && rv > 0) {
      const sw = drawStars(this.doc, infoX, iy - 0.1, rv, 0.11);
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9); this.doc.setTextColor(70, 70, 70);
      let rx = infoX + sw + 0.08;
      this.doc.text(rv.toFixed(1), rx, iy); rx += this.doc.getTextWidth(rv.toFixed(1)) + 0.05;
      if (d.reviews) { this.doc.setFont('helvetica', 'normal'); this.doc.text(`(${d.reviews} reviews)`, rx, iy); }
      iy += 0.24;
    }
    // Availability / seller / shipping
    for (const [label, val, color] of [
      ['Availability', d.availability, [70, 140, 70]] as const,
      ['Shipping', d.shipping, [60, 120, 60]] as const,
      ['Seller', d.seller, [80, 80, 80]] as const,
    ]) {
      if (!val) continue;
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8.5);
      this.doc.setTextColor(color[0], color[1], color[2]);
      const line = (this.doc.splitTextToSize(`${label}: ${val}`, infoW) as string[])[0];
      this.doc.text(line, infoX, iy); iy += 0.18;
    }

    this.doc.setTextColor(30, 30, 30);
    this.y += Math.max(imgH, iy - this.y) + 0.2;

    // Description under the hero
    if (d.description) {
      this.ensure(0.5);
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9.5); this.doc.setTextColor(40, 40, 40);
      this.doc.text('Description', M, this.y); this.y += 0.16;
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8.5); this.doc.setTextColor(70, 70, 70);
      const lines = this.doc.splitTextToSize(d.description, CW) as string[];
      for (const ln of lines) { this.ensure(0.15); this.doc.text(ln, M, this.y); this.y += 0.15; }
      this.y += 0.1; this.doc.setTextColor(30, 30, 30);
    }
  }

  private drawGallery(d: ProductDetail): void {
    const thumbs = (d.imagesBase64 ?? []).slice(1).filter(Boolean) as string[];
    if (!thumbs.length) return;
    this.ensure(0.4);
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9.5); this.doc.setTextColor(40, 40, 40);
    this.doc.text(`More images (${thumbs.length + 1})`, M, this.y); this.y += 0.16;
    const size = 1.05; const gap = 0.12; const perRow = Math.floor((CW + gap) / (size + gap));
    for (let i = 0; i < thumbs.length; i++) {
      const col = i % perRow;
      if (col === 0) this.ensure(size + 0.15);
      const x = M + col * (size + gap);
      this.doc.setDrawColor(230, 230, 233); this.doc.setFillColor(255, 255, 255);
      this.doc.roundedRect(x, this.y, size, size, 0.04, 0.04, 'FD');
      this.fitImage(thumbs[i], x, this.y, size, size);
      if (d.url) this.doc.link(x, this.y, size, size, { url: d.url });
      if (col === perRow - 1 || i === thumbs.length - 1) this.y += size + gap;
    }
    this.y += 0.1; this.doc.setTextColor(30, 30, 30);
  }

  private drawVariants(d: ProductDetail): void {
    if (!d.variants.length) return;
    this.ensure(0.4);
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9.5); this.doc.setTextColor(40, 40, 40);
    this.doc.text('Available options', M, this.y); this.y += 0.18;
    for (const g of d.variants) {
      this.ensure(0.3);
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(8.5); this.doc.setTextColor(60, 60, 60);
      this.doc.text(`${g.name}:`, M, this.y); this.y += 0.16;
      // Chips
      let x = M; const chipH = 0.2; const pad = 0.08;
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8);
      for (const opt of g.options) {
        const label = opt.price ? `${opt.label} — ${opt.price}` : opt.label;
        const w = this.doc.getTextWidth(label) + pad * 2;
        if (x + w > M + CW) { x = M; this.y += chipH + 0.06; this.ensure(chipH + 0.06); }
        this.doc.setFillColor(240, 244, 250); this.doc.setDrawColor(210, 220, 235);
        this.doc.roundedRect(x, this.y - chipH + 0.05, w, chipH, 0.03, 0.03, 'FD');
        this.doc.setTextColor(45, 70, 120); this.doc.text(label, x + pad, this.y);
        x += w + 0.08;
      }
      this.y += chipH + 0.12;
    }
    this.doc.setTextColor(30, 30, 30);
  }

  private drawFeatures(d: ProductDetail): void {
    if (!d.features.length) return;
    this.ensure(0.4);
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9.5); this.doc.setTextColor(40, 40, 40);
    this.doc.text('About this item', M, this.y); this.y += 0.18;
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8.5); this.doc.setTextColor(60, 60, 60);
    for (const f of d.features) {
      const lines = this.doc.splitTextToSize(f, CW - 0.2) as string[];
      this.ensure(lines.length * 0.15 + 0.04);
      this.doc.setFillColor(30, 100, 200); this.doc.circle(M + 0.04, this.y - 0.05, 0.02, 'F');
      this.doc.text(lines, M + 0.16, this.y); this.y += lines.length * 0.15 + 0.04;
    }
    this.y += 0.08; this.doc.setTextColor(30, 30, 30);
  }

  private drawSpecs(d: ProductDetail): void {
    if (!d.specs.length) return;
    this.ensure(0.4);
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9.5); this.doc.setTextColor(40, 40, 40);
    this.doc.text('Specifications', M, this.y); this.y += 0.18;
    const labelW = 2.2; const rowPad = 0.06;
    this.doc.setFontSize(8.5);
    d.specs.forEach((row, idx) => {
      const valLines = this.doc.splitTextToSize(row.value, CW - labelW - 0.2) as string[];
      const rowH = Math.max(0.2, valLines.length * 0.15 + rowPad);
      this.ensure(rowH);
      if (idx % 2 === 0) { this.doc.setFillColor(247, 248, 250); this.doc.rect(M, this.y - 0.13, CW, rowH, 'F'); }
      this.doc.setFont('helvetica', 'bold'); this.doc.setTextColor(70, 70, 70);
      this.doc.text((this.doc.splitTextToSize(row.label, labelW - 0.1) as string[]).slice(0, 2), M + 0.05, this.y);
      this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(50, 50, 50);
      this.doc.text(valLines, M + labelW, this.y);
      this.y += rowH;
    });
    this.y += 0.1; this.doc.setTextColor(30, 30, 30);
  }

  private drawOrderButton(d: ProductDetail): void {
    if (!d.url) return;
    this.ensure(0.4);
    const bw = 2.6; const bh = 0.28; const bx = M + (CW - bw) / 2;
    this.doc.setFillColor(30, 100, 200); this.doc.roundedRect(bx, this.y, bw, bh, 0.05, 0.05, 'F');
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(10); this.doc.setTextColor(255, 255, 255);
    this.doc.text('Click here to view & order', bx + bw / 2, this.y + bh * 0.66, { align: 'center' });
    this.doc.link(bx, this.y, bw, bh, { url: d.url });
    this.y += bh + 0.1; this.doc.setTextColor(30, 30, 30);
  }

  private fitImage(dataUrl: string, x: number, y: number, w: number, h: number): void {
    try {
      const fmt = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      const props = this.doc.getImageProperties(dataUrl);
      const ar = (props.width || 1) / (props.height || 1);
      let dw = w * 0.94; let dh = dw / ar;
      if (dh > h * 0.94) { dh = h * 0.94; dw = dh * ar; }
      this.doc.addImage(dataUrl, fmt, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, 'SLOW');
    } catch { this.noImage(x, y, w, h); }
  }

  private noImage(x: number, y: number, w: number, h: number): void {
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8); this.doc.setTextColor(180, 180, 180);
    this.doc.text('No Image', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' });
    this.doc.setTextColor(30, 30, 30);
  }

  private addHeader(): void {
    this.doc.setFillColor(30, 100, 200); this.doc.rect(0, 0, PW, HEADER_H, 'F');
    let leftX = M;
    if (this.meta.showLogo && this.meta.companyLogo) {
      try {
        const fmt = this.meta.companyLogo.includes('image/png') ? 'PNG' : 'JPEG';
        const sz = HEADER_H - 0.2;
        this.doc.addImage(this.meta.companyLogo, fmt, M, 0.1, sz, sz, undefined, 'FAST');
        leftX = M + sz + 0.12;
      } catch { /* ignore */ }
    }
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(13); this.doc.setTextColor(255, 255, 255);
    if (this.meta.companyName) this.doc.text(this.meta.companyName, leftX, 0.27);
    const who: string[] = [];
    if (this.meta.customerName) who.push(`Prepared for: ${this.meta.customerName}`);
    if (this.meta.representative) who.push(`Rep: ${this.meta.representative}`);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7.5); this.doc.setTextColor(215, 232, 255);
    if (who.length) this.doc.text(who.join('   ·   '), leftX, 0.46);
    this.doc.setFontSize(8); this.doc.setTextColor(230, 240, 255); this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.meta.catalogId, PW - M, 0.22, { align: 'right' });
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7);
    const dt = new Date(this.meta.timestamp).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    this.doc.text(dt, PW - M, 0.4, { align: 'right' });
    this.doc.setTextColor(0, 0, 0);
  }

  private addFooter(): void {
    const fy = PH - FOOTER_H;
    this.doc.setFillColor(245, 245, 245); this.doc.rect(0, fy, PW, FOOTER_H, 'F');
    this.doc.setDrawColor(210, 210, 210); this.doc.line(0, fy, PW, fy);
    const sz = FOOTER_H - 0.14; let textX = M;
    try { this.doc.addImage(CODELAB_LOGO, 'PNG', M, fy + 0.07, sz, sz, undefined, 'FAST'); textX = M + sz + 0.07; } catch { /* ignore */ }
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(8); this.doc.setTextColor(60, 60, 60);
    this.doc.text('Developed by CodeLab', textX, fy + FOOTER_H * 0.62);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7); this.doc.setTextColor(120, 120, 120);
    this.doc.text(`${this.meta.marketplace} product sheet`, PW / 2, fy + FOOTER_H * 0.62, { align: 'center' });
    this.doc.setTextColor(0, 0, 0);
  }
}
export const detailPdfGenerator = new DetailPDFGenerator();
