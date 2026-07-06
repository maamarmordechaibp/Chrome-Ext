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

/**
 * Modesty filter: uses an in-browser AI model (BodyPix) to locate the person, then paints
 * over only the exposed-skin pixels inside that region — the face, arms and legs — while
 * leaving the clothing/product the model is wearing or holding fully visible. This keeps
 * garments intact instead of greying out the whole silhouette.
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

    // Primary: AI person segmentation — paint only the actual body pixels.
    try {
      const { segmentPeople } = await import('./personDetector');
      const timeout = new Promise<null>((res) => setTimeout(() => res(null), 15000));
      const mask = await Promise.race([segmentPeople(canvas, 0.6), timeout]);
      if (mask) {
        const frame = ctx.getImageData(0, 0, w, h);
        const px = frame.data;
        const md = mask.data; const mw = mask.width; const mh = mask.height;
        const sx = mw / w; const sy = mh / h;
        for (let y = 0; y < h; y++) {
          const my = Math.min(mh - 1, (y * sy) | 0) * mw;
          for (let x = 0; x < w; x++) {
            if (md[my + Math.min(mw - 1, (x * sx) | 0)] === 1) {
              const i = (y * w + x) * 4;
              // Only paint the actual human skin — not the dress or items being worn/held.
              if (isSkin(px[i], px[i + 1], px[i + 2])) {
                px[i] = 220; px[i + 1] = 220; px[i + 2] = 220; px[i + 3] = 255;
              }
            }
          }
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
