// Pixi-side atlas loading. Turns a sprite atlas (one PNG + frame rects) into a
// map of per-frame Textures the renderer can swap. Pure validation lives in
// `atlas.ts`; this module is the only one that touches Pixi here.
import { Assets, Rectangle, Texture } from 'pixi.js';
import type { FrameRect } from '../engine/schema.ts';

/**
 * Load the atlas PNG at `url` and slice it into a Texture per frame key.
 *
 * `url` is resolved by the caller (a bundled import URL in M2.0, a Blob URL
 * from IndexedDB for AI-generated characters in M2.2) — this loader does not
 * interpret `spriteAtlas.url` itself.
 */
export async function loadAtlasTextures(
  url: string,
  frames: Record<string, FrameRect>,
): Promise<Record<string, Texture>> {
  const base = await Assets.load<Texture>(url);
  // Crisp pixels for hand-drawn / pixel art; matches `antialias: false`.
  base.source.scaleMode = 'nearest';

  const out: Record<string, Texture> = {};
  for (const [key, rect] of Object.entries(frames)) {
    out[key] = new Texture({
      source: base.source,
      frame: new Rectangle(rect.x, rect.y, rect.w, rect.h),
    });
  }
  return out;
}
