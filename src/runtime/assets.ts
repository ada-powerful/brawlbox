// Pixi-side atlas loading. Turns a sprite atlas (one PNG + frame rects) into a
// map of per-frame Textures the renderer can swap. Pure validation lives in
// `atlas.ts`; this module is the only one that touches Pixi here.
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import type { FrameRect } from '../engine/schema.ts';

/**
 * Load the atlas PNG at `url` and slice it into a Texture per frame key.
 *
 * `url` is resolved by the caller (a bundled import URL in M2.0, a Blob URL
 * from IndexedDB / generated sprites in M2.2). We fetch + decode the bytes
 * ourselves rather than `Assets.load(url)`: Pixi can't infer a parser for an
 * extensionless `blob:` URL, so it would fail to load generated atlases.
 */
export async function loadAtlasTextures(
  url: string,
  frames: Record<string, FrameRect>,
): Promise<Record<string, Texture>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load atlas (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const source = new ImageSource({ resource: bitmap });
  // Crisp pixels for hand-drawn / pixel art; matches `antialias: false`.
  source.scaleMode = 'nearest';

  const out: Record<string, Texture> = {};
  for (const [key, rect] of Object.entries(frames)) {
    out[key] = new Texture({
      source,
      frame: new Rectangle(rect.x, rect.y, rect.w, rect.h),
    });
  }
  return out;
}
