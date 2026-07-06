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
    internalResolution: 'medium',
    segmentationThreshold: threshold,
    maxDetections: 10,
  });
  const anyPerson = (seg.data as Uint8Array).some((v) => v === 1);
  if (!anyPerson) return null;
  return { data: seg.data as Uint8Array, width: seg.width, height: seg.height };
}
