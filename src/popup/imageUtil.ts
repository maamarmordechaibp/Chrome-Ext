/** Downscales a base64 image data URL to a small JPEG thumbnail for history previews. */
export async function makeThumbnail(dataUrl: string, size = 96): Promise<string | undefined> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(size / img.width, size / img.height, 1);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch { return undefined; }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Converts an image to high-contrast grayscale for fax output. Faxes transmit
 *  1-bit monochrome, so colour photos otherwise turn to mud; boosting contrast
 *  on a luma-grayscale version keeps edges and detail legible. Returns the
 *  original data URL unchanged on any failure. */
export async function toFaxGray(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.width, h = img.height;
    if (!w || !h) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    const contrast = 1.35; // >1 widens the tonal range so photos don't fax muddy.
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < d.length; i += 4) {
      let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      y = y * contrast + intercept;
      y = y < 0 ? 0 : y > 255 ? 255 : y;
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch { return dataUrl; }
}

/**
 * Modesty filter: uses an in-browser AI model (BodyPix) to locate the person, then paints
 * over only the person's exposed SKIN inside that region — face, hands, arms and legs —
 * while leaving the clothing/product they wear or hold fully visible. Requiring both
 * "is a person" AND "is skin" means a flat-lay dress or a pair of shorts is never greyed
 * out, even if the model mistakes the product for a person. The skin area is closed with a
 * small dilation so it paints solidly instead of speckling.
 * If the model can't be reached, it falls back to a conservative skin-tone heuristic.
 */
export async function redactPeople(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.width, h = img.height;
    if (!w || !h) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);

    // Primary: AI person segmentation — paint the person's skin only.
    try {
      const { segmentPeople } = await import('./personDetector');
      const timeout = new Promise<null>((res) => setTimeout(() => res(null), 15000));
      const mask = await Promise.race([segmentPeople(canvas, 0.6), timeout]);
      if (mask) {
        const md = mask.data; const mw = mask.width; const mh = mask.height;
        const frame = ctx.getImageData(0, 0, w, h);
        const px = frame.data;
        const sx = mw / w; const sy = mh / h;
        // Full-res skin mask, gated by the person region: 1 only where BodyPix
        // sees a person AND the pixel is human skin (not fabric/khaki/beige).
        const skin = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
          const my = Math.min(mh - 1, (y * sy) | 0) * mw;
          for (let x = 0; x < w; x++) {
            if (md[my + Math.min(mw - 1, (x * sx) | 0)] !== 1) continue;
            const i = (y * w + x) * 4;
            if (isSkin(px[i], px[i + 1], px[i + 2])) skin[y * w + x] = 1;
          }
        }
        // Close small gaps so skin paints as a solid block, not speckles.
        const solid = dilateMask(skin, w, h, Math.max(1, Math.round(Math.min(w, h) / 120)));
        for (let p = 0; p < solid.length; p++) {
          if (solid[p] !== 1) continue;
          const i = p * 4;
          px[i] = 220; px[i + 1] = 220; px[i + 2] = 220; px[i + 3] = 255;
        }
        ctx.putImageData(frame, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.88);
      }
      return dataUrl;
    } catch {
      // Fall back to the skin-tone heuristic if the model failed to load.
      return redactBySkin(ctx, canvas, w, h, dataUrl);
    }
  } catch { return dataUrl; }
}

/** Expands a binary skin mask by `radius` cells so its edges join up into a solid
 *  patch (closing the speckles the strict skin test leaves) without bleeding across
 *  the whole silhouette. */
function dilateMask(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return src;
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] !== 1) continue;
      const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius);
      const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) out[ny * w + nx] = 1;
      }
    }
  }
  return out;
}

/** Conservative fallback: paints skin-tone-heavy regions when the AI model is unavailable. */
function redactBySkin(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  w: number, h: number, dataUrl: string,
): string {
  let px: Uint8ClampedArray;
  try { px = ctx.getImageData(0, 0, w, h).data; } catch { return dataUrl; }

  const cell = Math.max(6, Math.round(Math.min(w, h) / 28));
  const paint: Array<[number, number, number, number]> = [];
  let skinTotal = 0, sampled = 0;

  for (let cy = 0; cy < h; cy += cell) {
    for (let cx = 0; cx < w; cx += cell) {
      const cw = Math.min(cell, w - cx);
      const ch = Math.min(cell, h - cy);
      let skin = 0, total = 0;
      for (let y = cy; y < cy + ch; y++) {
        const row = y * w;
        for (let x = cx; x < cx + cw; x++) {
          const i = (row + x) * 4;
          if (isSkin(px[i], px[i + 1], px[i + 2])) skin++;
          total++;
        }
      }
      if (total > 0) {
        skinTotal += skin; sampled += total;
        if (skin / total > 0.5) paint.push([cx, cy, cw, ch]);
      }
    }
  }

  if (sampled === 0 || skinTotal / sampled < 0.22 || paint.length < 6) return dataUrl;

  ctx.fillStyle = '#dcdcdc';
  for (const [cx, cy, cw, ch] of paint) ctx.fillRect(cx, cy, cw, ch);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Strict human-skin heuristic. Beyond the usual RGB + YCbCr bands it requires the
 * red-over-green lead to exceed the green-over-blue lead — the signature that separates
 * real skin from tan/khaki/beige fabric, which otherwise falls in the same colour range.
 */
function isSkin(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const rgbRule = r > 95 && g > 40 && b > 20 && (max - min) > 15 &&
    (r - g) > 12 && (r - g) >= (g - b) && (r - b) > 18;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const ycbcrRule = cb >= 80 && cb <= 125 && cr >= 138 && cr <= 173;
  return rgbRule && ycbcrRule;
}
