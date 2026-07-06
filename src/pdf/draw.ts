import { jsPDF } from 'jspdf';

/** Letter-page geometry (inches) shared by the catalog and detail generators. */
export const PW = 8.5;
export const PH = 11;
export const M = 0.35;

/** Brand accent colours per marketplace. */
export const MC: Record<string, [number, number, number]> = {
  Amazon: [255, 153, 0], Walmart: [0, 113, 206], eBay: [225, 50, 35],
  AliExpress: [255, 70, 0], Unknown: [120, 120, 120],
};

/** Draws a single 5-point star as a vector shape at (cx, cy). */
function drawStarShape(doc: jsPDF, cx: number, cy: number, rOuter: number, style: 'F' | 'FD'): void {
  const rInner = rOuter * 0.45;
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? rOuter : rInner;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  const [sx, sy] = pts[0];
  // jsPDF's lines() expects each segment relative to the PREVIOUS point, not the start.
  const deltas: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.lines(deltas, sx, sy, [1, 1], style, true);
}

/** Draws 5 stars (gold = filled, grey = empty) for the rating. Returns total width. */
export function drawStars(doc: jsPDF, x: number, y: number, rating: number, size: number): number {
  const gap = size * 0.32;
  const r = Math.max(0, Math.min(5, rating));
  // jsPDF's default pen is 0.2in wide; without a thin line width the tiny stars
  // render as huge blobs. Use a hairline outline scaled to the star size.
  const prevLw = doc.getLineWidth();
  doc.setLineWidth(Math.min(0.01, size * 0.08));
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (size + gap) + size / 2;
    const cy = y + size / 2;
    const filled = r - i >= 0.5;
    if (filled) { doc.setFillColor(245, 175, 0); doc.setDrawColor(230, 160, 0); }
    else { doc.setFillColor(228, 228, 228); doc.setDrawColor(210, 210, 210); }
    drawStarShape(doc, cx, cy, size / 2, 'FD');
  }
  doc.setLineWidth(prevLw);
  return 5 * size + 4 * gap;
}
