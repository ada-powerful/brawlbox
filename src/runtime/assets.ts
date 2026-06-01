// Pixi-side atlas loading. Turns a sprite atlas (one PNG + frame rects) into a
// map of per-frame Textures the renderer can swap. Pure validation lives in
// `atlas.ts`; this module is the only one that touches Pixi here.
import { Assets, Rectangle, Texture } from 'pixi.js';
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
  // Force the texture parser: Pixi auto-detects parsers by file extension, which
  // an extensionless `blob:`/object URL lacks — without this it fails to load
  // generated atlases. This yields a correctly-dimensioned base texture so the
  // per-frame Rectangles below slice properly.
  const base = await Assets.load<Texture>({ src: url, loadParser: 'loadTextures' });
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
