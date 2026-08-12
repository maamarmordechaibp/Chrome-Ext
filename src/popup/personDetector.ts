import type { BodyPix } from '@tensorflow-models/body-pix';

let modelPromise: Promise<BodyPix> | null = null;

/** Lazily loads the BodyPix segmentation model once and reuses it for every image. */
async function getModel(): Promise<BodyPix> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const bodyPix = await import('@tensorflow-models/body-pix');
      // MobileNetV1 @ 0.75 with output stride 16 — small and fast, good enough for masks.
      return bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2,
      });
    })();
  }
  return modelPromise;
}

/** Kicks off model loading in the background (e.g. while the rep reviews the
 *  scan) so the first redaction isn't stuck waiting for the download. */
export function preloadPersonModel(): void {
  void getModel().catch(() => { modelPromise = null; });
}

/** Loads the segmentation model and waits until it's ready (up to timeoutMs) so
 *  every image is actually reviewed instead of slipping through while the model
 *  is still downloading — important for the background job's cold offscreen
 *  document. Returns false if the model couldn't load in time. */
export async function ensurePersonModel(timeoutMs = 90000): Promise<boolean> {
  const load = getModel();
  load.catch(() => { modelPromise = null; }); // reset on genuine failure so a retry can reload
  const model = await Promise.race([
    load.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  return !!model;
}

/**
 * Returns a per-pixel person mask (1 = person, 0 = background) for the given canvas,
 * so only the actual body pixels can be painted over — not a full rectangle.
 * Works regardless of skin color and ignores flat-lay products.
 */
export async function segmentPeople(
  source: HTMLCanvasElement,
  threshold = 0.6,
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  const model = await getModel();
  const seg = await model.segmentPerson(source, {
    internalResolution: 'low',
    segmentationThreshold: threshold,
    maxDetections: 10,
  });
  const anyPerson = (seg.data as Uint8Array).some((v) => v === 1);
  if (!anyPerson) return null;
  return { data: seg.data as Uint8Array, width: seg.width, height: seg.height };
}
