// Turn a bundled MUGEN action-template sheet into a real engine character,
// entirely in the browser. This is the exact detect → select → crop → pack →
// apply pipeline the creator runs for backend-generated sheets, minus the
// network: the sheet is a static asset, so the sandbox can exercise the real
// sprite-render path with no auth, cloud, or AI dependency.
import type { Character } from '@/engine/schema.ts';
import { collectReferencedSprites } from '@/runtime/atlas.ts';
import { detectFrames } from '@/creator/image/detectFrames.ts';
import { selectFrameIndices } from '@/creator/image/templateManifest.ts';
import type { PixelBox } from '@/creator/image/alpha.ts';
import { packSprites } from '@/creator/image/packAtlas.ts';
import { applySpritesToCharacter } from '@/creator/image/pack.ts';

export interface BakedCharacter {
  character: Character;
  /** Object URL of the packed atlas PNG. Revoke when the character is dropped. */
  atlasUrl: string;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function context2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas)
    return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
}

function sheetPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = context2d(canvas);
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

async function cropBoxes(
  bitmap: ImageBitmap,
  frames: PixelBox[],
  selection: Record<string, number>,
): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  for (const [key, index] of Object.entries(selection)) {
    const box = frames[index];
    if (!box) continue;
    const canvas = makeCanvas(box.w, box.h);
    const ctx = context2d(canvas);
    ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    out[key] = await canvasToBlob(canvas);
  }
  return out;
}

/**
 * Bake `sheetUrl` into a playable character. Reuses `base`'s state machine,
 * data, and animation timings — only the sprite atlas (and the alpha-derived
 * body hurtboxes) come from the sheet. The template sits on black, which
 * packSprites keys out.
 */
export async function bakeFromSheet(
  sheetUrl: string,
  base: Character,
  opts: { id: string; name: string },
): Promise<BakedCharacter> {
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`fetching sheet failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const frames = detectFrames(sheetPixels(bitmap), bitmap.width, bitmap.height, {
      diffThreshold: 60,
    });
    if (frames.length === 0) throw new Error('no frames detected in sheet');

    const keys = collectReferencedSprites(base);
    const selection = selectFrameIndices(frames, keys);
    const images = await cropBoxes(bitmap, frames, selection);
    const packed = await packSprites(images, {
      chromaKey: { r: 0, g: 0, b: 0 },
      chromaTolerance: 90,
    });

    const tagged: Character = { ...base, meta: { ...base.meta, id: opts.id, name: opts.name } };
    const character = applySpritesToCharacter(
      tagged,
      `${opts.id}/atlas.png`,
      packed.frames,
      packed.hurtboxes,
    );
    return { character, atlasUrl: URL.createObjectURL(packed.atlasBlob) };
  } finally {
    bitmap.close();
  }
}
