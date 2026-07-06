import { jsPDF } from 'jspdf';
import { Product, Settings, CatalogMeta } from '../types';
import { CODELAB_LOGO } from './brand';
import { PW, PH, M, MC, drawStars } from './draw';

const HEADER_H = 0.62; const FOOTER_H = 0.34; const GAP = 0.1;

export class PDFGenerator {
  private doc!: jsPDF;
  private settings!: Settings;
  private meta!: CatalogMeta;
  private pageNum = 1;
  private totalPages = 1;

  async generate(products: Product[], settings: Settings, meta: CatalogMeta): Promise<Blob> {
    this.doc = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
    this.settings = settings; this.meta = meta; this.pageNum = 1;
    // jsPDF's default pen is 0.2in wide; use a crisp hairline for all strokes.
    this.doc.setLineWidth(0.01);
    const cols = settings.productsPerRow; const rows = settings.rowsPerPage;
    const itemsPerPage = cols * rows;
    this.totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
    const contentW = PW - M * 2; const contentH = PH - M * 2 - HEADER_H - FOOTER_H;
    const cardW = (contentW - (cols - 1) * GAP) / cols;
    const cardH = (contentH - (rows - 1) * GAP) / rows;
    this.addPageHeader();
    for (let i = 0; i < products.length; i++) {
      if (i > 0 && i % itemsPerPage === 0) {
        this.addPageFooter(); this.doc.addPage(); this.pageNum++; this.addPageHeader();
      }
      const pos = i % itemsPerPage;
      const col = pos % cols; const row = Math.floor(pos / cols);
      await this.drawCard(products[i], M + col * (cardW + GAP), M + HEADER_H + row * (cardH + GAP), cardW, cardH);
    }
    this.addPageFooter();
    return this.doc.output('blob');
  }

  private addPageHeader(): void {
    this.doc.setFillColor(30, 100, 200);
    this.doc.rect(0, 0, PW, HEADER_H, 'F');
    let leftX = M;
    if (this.settings.showLogo && this.meta.companyLogo) {
      try {
        const fmt = this.meta.companyLogo.includes('image/png') ? 'PNG' : 'JPEG';
        const logoSz = HEADER_H - 0.2;
        this.doc.addImage(this.meta.companyLogo, fmt, M, 0.1, logoSz, logoSz, undefined, 'FAST');
        leftX = M + logoSz + 0.12;
      } catch { /* ignore bad logo */ }
    }
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(13); this.doc.setTextColor(255,255,255);
    if (this.meta.companyName) this.doc.text(this.meta.companyName, leftX, 0.27);
    // Customer / representative line
    const who: string[] = [];
    if (this.meta.customerName) who.push(`Prepared for: ${this.meta.customerName}`);
    if (this.meta.representative) who.push(`Rep: ${this.meta.representative}`);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7.5); this.doc.setTextColor(215,232,255);
    if (who.length) this.doc.text(who.join('   ·   '), leftX, 0.46);
    // Right column: catalog id, date, totals
    this.doc.setFontSize(8); this.doc.setTextColor(230,240,255);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.meta.catalogId, PW - M, 0.22, { align: 'right' });
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7);
    const d = new Date(this.meta.timestamp).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    this.doc.text(d, PW - M, 0.4, { align: 'right' });
    this.doc.setTextColor(0,0,0);
  }

  private addPageFooter(): void {
    const fy = PH - FOOTER_H;
    this.doc.setFillColor(245,245,245); this.doc.rect(0, fy, PW, FOOTER_H, 'F');
    this.doc.setDrawColor(210,210,210); this.doc.line(0, fy, PW, fy);
    // Permanent CodeLab branding (logo + wordmark) — not user-editable.
    const logoSz = FOOTER_H - 0.14;
    const logoY = fy + 0.07;
    let textX = M;
    try {
      this.doc.addImage(CODELAB_LOGO, 'PNG', M, logoY, logoSz, logoSz, undefined, 'FAST');
      textX = M + logoSz + 0.07;
    } catch { /* ignore */ }
    this.doc.setFont('helvetica','bold'); this.doc.setFontSize(8); this.doc.setTextColor(60,60,60);
    this.doc.text('Developed by CodeLab', textX, fy + FOOTER_H * 0.62);
    // Center: search terms · marketplace
    this.doc.setFont('helvetica','normal'); this.doc.setFontSize(7); this.doc.setTextColor(120,120,120);
    const kw = this.meta.searchKeywords ? `"${this.meta.searchKeywords}"` : this.meta.marketplace;
    this.doc.text(`${kw}  ·  ${this.meta.marketplace}`, PW / 2, fy + FOOTER_H * 0.62, { align: 'center' });
    // Right: page numbers
    this.doc.setFont('helvetica','bold'); this.doc.setTextColor(90,90,90);
    this.doc.text(`Page ${this.pageNum} of ${this.totalPages}`, PW - M, fy + FOOTER_H * 0.62, { align: 'right' });
    this.doc.setTextColor(0,0,0);
  }

  private async drawCard(p: Product, x: number, y: number, w: number, h: number): Promise<void> {
    const pad = 0.1;
    this.doc.setFillColor(220,220,220); this.doc.roundedRect(x+0.02, y+0.02, w, h, 0.06, 0.06, 'F');
    this.doc.setFillColor(255,255,255); this.doc.setDrawColor(225,225,225);
    this.doc.roundedRect(x, y, w, h,  0.06, 0.06, 'FD');
    const bW=0.38; const bH=0.17; const bX=x+pad; const bY=y+pad;
    this.doc.setFillColor(30,100,200); this.doc.roundedRect(bX, bY, bW, bH, 0.02, 0.02, 'F');
    this.doc.setFont('helvetica','bold'); this.doc.setFontSize(7); this.doc.setTextColor(255,255,255);
    this.doc.text(`# ${p.itemNumber}`, bX + bW/2, bY + bH*0.7, { align: 'center' });
    const mC = MC[p.marketplace] ?? MC.Unknown;
    const mX=bX+bW+0.06; const mW=0.6;
    this.doc.setFillColor(...mC); this.doc.roundedRect(mX, bY, mW, bH, 0.02, 0.02, 'F');
    this.doc.setFontSize(6); this.doc.text(p.marketplace, mX+mW/2, bY+bH*0.7, { align: 'center' });
    if (p.isPrime) {
      const pX=mX+mW+0.06; const pW=0.35;
      this.doc.setFillColor(0,112,201); this.doc.roundedRect(pX,bY,pW,bH,0.02,0.02,'F');
      this.doc.setFontSize(5.5); this.doc.text('prime', pX+pW/2, bY+bH*0.7, { align:'center' });
    }
    const imgBoxX = x+pad; const imgBoxY = y+pad+bH+0.08;
    const imgBoxW = w-pad*2; const imgBoxH = h*0.46;
    this.doc.setFillColor(255,255,255); this.doc.setDrawColor(235,235,238);
    this.doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 0.03, 0.03, 'FD');
    if (p.imageBase64) {
      try {
        const fmt = p.imageBase64.includes('image/png') ? 'PNG' : 'JPEG';
        // Preserve aspect ratio: fit the image inside the box, centered, no stretching.
        const props = this.doc.getImageProperties(p.imageBase64);
        const ar = (props.width || 1) / (props.height || 1);
        let dw = imgBoxW * 0.96; let dh = dw / ar;
        if (dh > imgBoxH * 0.96) { dh = imgBoxH * 0.96; dw = dh * ar; }
        const dx = imgBoxX + (imgBoxW - dw) / 2;
        const dy = imgBoxY + (imgBoxH - dh) / 2;
        this.doc.addImage(p.imageBase64, fmt, dx, dy, dw, dh, undefined, 'SLOW');
      } catch { this.drawPlaceholder(imgBoxX, imgBoxY, imgBoxW, imgBoxH); }
    } else { this.drawPlaceholder(imgBoxX, imgBoxY, imgBoxW, imgBoxH); }
    // Make the product image clickable — opens the original listing.
    if (p.url) this.doc.link(imgBoxX, imgBoxY, imgBoxW, imgBoxH, { url: p.url });

    let ty = imgBoxY+imgBoxH+0.14; const tx=x+pad; const tw=w-pad*2;
    // Reserve room at the bottom for the clickable "order" button so text never overlaps it.
    const bottomLimit = y + h - pad - (p.url ? 0.22 : 0);
    const canFit = (lines: number, lh: number) => ty + lines * lh <= bottomLimit;

    this.doc.setTextColor(30,30,30);
    this.doc.setFont('helvetica','bold'); this.doc.setFontSize(8);
    // Item name — kept to 2 lines so a brief description below always has room.
    const tl = (this.doc.splitTextToSize(p.title, tw) as string[]).slice(0,2);
    this.doc.text(tl, tx, ty);
    // Title is also a clickable link to the listing.
    if (p.url) this.doc.link(tx, ty - 0.1, tw, tl.length * 0.11 + 0.05, { url: p.url });
    ty += tl.length*0.11+0.03;

    // Brief description shown directly under the name (independent of the title).
    if (p.description && this.settings.showDescription && canFit(1, 0.095)) {
      this.doc.setFont('helvetica','normal'); this.doc.setFontSize(6.5); this.doc.setTextColor(95,95,95);
      const dl = (this.doc.splitTextToSize(p.description, tw) as string[]).slice(0,2);
      this.doc.text(dl, tx, ty); ty += dl.length*0.095+0.02; this.doc.setTextColor(30,30,30);
    }
    if (p.brand && this.settings.showBrand && canFit(1, 0.1)) {
      this.doc.setFont('helvetica','bold'); this.doc.setFontSize(6.5); this.doc.setTextColor(90,90,160);
      this.doc.text(`Brand: ${p.brand.substring(0,40)}`, tx, ty); ty += 0.1; this.doc.setTextColor(30,30,30);
    }

    this.doc.setFont('helvetica','bold'); this.doc.setFontSize(11); this.doc.setTextColor(190,30,30);
    const pt = p.price || 'N/A'; this.doc.text(pt, tx, ty);
    if (p.originalPrice && this.settings.showDiscounts) {
      const pw = this.doc.getTextWidth(pt);
      const ox = tx+pw+0.06;
      this.doc.setFont('helvetica','normal'); this.doc.setFontSize(7); this.doc.setTextColor(160,160,160);
      this.doc.text(p.originalPrice, ox, ty);
      const ow = this.doc.getTextWidth(p.originalPrice);
      this.doc.setDrawColor(160,160,160); this.doc.line(ox, ty-0.025, ox+ow, ty-0.025);
      if (p.discount) {
        this.doc.setTextColor(30,150,30); this.doc.setFontSize(6.5);
        this.doc.text(p.discount, ox+ow+0.06, ty);
      }
    }
    ty += 0.14; this.doc.setTextColor(30,30,30);

    const ratingVal = p.rating ? parseFloat(p.rating) : NaN;
    if (!isNaN(ratingVal) && ratingVal > 0 && this.settings.showRatings && canFit(1, 0.1)) {
      const starW = drawStars(this.doc, tx, ty - 0.075, ratingVal, 0.09);
      this.doc.setFont('helvetica','bold'); this.doc.setFontSize(7); this.doc.setTextColor(70,70,70);
      let rx = tx + starW + 0.06;
      this.doc.text(ratingVal.toFixed(1), rx, ty); rx += this.doc.getTextWidth(ratingVal.toFixed(1)) + 0.03;
      this.doc.setFont('helvetica','normal');
      if (p.reviews && this.settings.showReviews) this.doc.text(`(${p.reviews})`, rx, ty);
      ty += 0.12; this.doc.setTextColor(30,30,30);
    }
    if (p.availability && canFit(1, 0.095)) {
      this.doc.setFont('helvetica','normal'); this.doc.setFontSize(6.5); this.doc.setTextColor(70,70,70);
      this.doc.text(p.availability.substring(0,45), tx, ty); ty += 0.095; this.doc.setTextColor(30,30,30);
    }
    if (p.shipping && this.settings.showShipping && canFit(1, 0.095)) {
      this.doc.setFont('helvetica','normal'); this.doc.setFontSize(6.5); this.doc.setTextColor(60,140,60);
      this.doc.text(p.shipping.substring(0,50), tx, ty); ty += 0.095; this.doc.setTextColor(30,30,30);
    }
    if (p.seller && this.settings.showSeller && canFit(1, 0.095)) {
      this.doc.setFont('helvetica','normal'); this.doc.setFontSize(6.5); this.doc.setTextColor(80,80,80);
      this.doc.text(`Sold by: ${p.seller.substring(0,35)}`, tx, ty); ty += 0.095;
    }
    if (p.url && this.settings.showProductURL && canFit(1, 0.09)) {
      this.doc.setFont('helvetica','normal'); this.doc.setFontSize(5.5); this.doc.setTextColor(110,110,200);
      this.doc.text((this.doc.splitTextToSize(p.url, tw) as string[])[0], tx, ty); this.doc.setTextColor(30,30,30);
      ty += 0.09;
    }
    // Visible clickable call-to-action so a rep can open the listing and order it.
    if (p.url) {
      const bh = 0.17; const by = y + h - pad - bh + 0.01;
      const label = 'Click to view & order';
      this.doc.setFont('helvetica','bold'); this.doc.setFontSize(6.5);
      const lw = Math.min(tw, this.doc.getTextWidth(label) + 0.16);
      this.doc.setFillColor(30,100,200); this.doc.roundedRect(tx, by, lw, bh, 0.03, 0.03, 'F');
      this.doc.setTextColor(255,255,255);
      this.doc.text(label, tx + lw/2, by + bh*0.68, { align: 'center' });
      this.doc.link(tx, by, lw, bh, { url: p.url });
      this.doc.setTextColor(30,30,30);
    }
  }

  private drawPlaceholder(x:number,y:number,w:number,h:number): void {
    this.doc.setFillColor(245,245,248); this.doc.roundedRect(x,y,w,h,0.03,0.03,'F');
    this.doc.setFont('helvetica','normal'); this.doc.setFontSize(7.5); this.doc.setTextColor(180,180,180);
    this.doc.text('No Image', x+w/2, y+h/2, { align:'center', baseline:'middle' });
    this.doc.setTextColor(30,30,30);
  }
}
export const pdfGenerator = new PDFGenerator();