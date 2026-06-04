// Pure atlas layout math. The actual canvas drawing lives in packAtlas.ts
// (browser-only); this computes where each frame goes so it can be tested.
import type { AABB, Character, FrameRect } from '../../engine/schema.ts';

export interface GridLayout {
  frames: Record<string, FrameRect>;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

/**
 * Lay out `keys` into a uniform grid of cellW x cellH cells, `cols` per row
 * (defaults to a roughly-square grid). Frame order follows `keys` order, which
 * the caller keeps stable (collectReferencedSprites is sorted).
 */
export function gridLayout(
  keys: string[],
  cellW: number,
  cellH: number,
  cols = Math.ceil(Math.sqrt(keys.length)),
): GridLayout {
  const columns = Math.max(1, cols);
  const rows = Math.max(1, Math.ceil(keys.length / columns));
  const frames: Record<string, FrameRect> = {};
  keys.forEach((key, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    frames[key] = { x: col * cellW, y: row * cellH, w: cellW, h: cellH };
  });
  return { frames, width: columns * cellW, height: rows * cellH, cols: columns, rows };
}

// Canonical body width:height (kfm2 60×110). MUST match render/fighter.ts so the
// collision hurtbox lands exactly on the rendered sprite.
const NEUTRAL_BODY_RATIO = 60 / 110;
// Smallest forward extent a clamped attack hitbox keeps, so a short pose still
// connects rather than collapsing to zero width.
const MIN_HITBOX_W = 8;

/**
 * Return a copy of `character` wired to a generated atlas: sets spriteAtlas and
 * overwrites each animation frame's body hurtbox with the alpha-derived box.
 * Attack hitboxes (LLM-authored) are left untouched. `atlasUrl` is the logical
 * reference stored in the JSON; the runtime resolves it to a real URL.
 *
 * The alpha hurtboxes come in CELL-pixel units (the packed 240px cell), but the
 * renderer scales each cell down to the character's world size — so collision
 * must use the SAME scale or it tests a body ~2× too big (hits land out at the
 * padded frame edge instead of body-to-body). We apply the renderer's exact
 * per-axis factors (Y = size.height/cellH; X = size.width / (cellH·ratio)) so the
 * hurtbox tracks the visible silhouette.
 */
export function applySpritesToCharacter(
  character: Character,
  atlasUrl: string,
  frames: Record<string, FrameRect>,
  hurtboxes: Record<string, AABB>,
): Character {
  const next = structuredClone(character);
  next.spriteAtlas = { url: atlasUrl, frames };
  const cellH = Object.values(frames)[0]?.h ?? character.size.height;
  const scaleY = character.size.height / cellH;
  const scaleX = character.size.width / (cellH * NEUTRAL_BODY_RATIO);
  const toWorld = (b: AABB): AABB => ({
    x: b.x * scaleX,
    y: b.y * scaleY,
    w: b.w * scaleX,
    h: b.h * scaleY,
  });
  for (const anim of Object.values(next.animations ?? {})) {
    for (const frame of anim.frames) {
      const hb = hurtboxes[frame.sprite];
      if (!hb) continue;
      const wh = toWorld(hb);
      frame.hurtboxes = [wh];
      if (frame.hitboxes.length === 0) continue;
      // Cap each attack's forward reach at the limb — the silhouette's forward
      // edge for this frame — so hits land when the visible limb meets the body,
      // not out at the hand-authored (padded-cell-era) reach. Keep the authored
      // vertical zone (high/low) and a minimum width so the move still connects.
      const fwd = wh.x + wh.w;
      frame.hitboxes = frame.hitboxes.map((box) => {
        const x = Math.max(0, Math.min(box.x, fwd - MIN_HITBOX_W));
        return { ...box, x, w: Math.max(MIN_HITBOX_W, fwd - x) };
      });
    }
  }
  return next;
}
