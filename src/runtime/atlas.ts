// Pure atlas helpers — NO pixi/DOM imports, so the engine tests can use them.
// The Pixi texture building lives in `assets.ts`, which imports this module.
import type { AnimFrame, Character } from '../engine/schema.ts';

/** Resolve the AnimFrame a player is currently showing, or undefined. */
export function animFrameAt(
  character: Character,
  animId: string,
  frame: number,
): AnimFrame | undefined {
  const anim = character.animations?.[animId];
  if (!anim) return undefined;
  return anim.frames[frame];
}

/** Every sprite key referenced by any animation frame, in stable order, de-duped. */
export function collectReferencedSprites(character: Character): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Sort anim ids for determinism — Object key order is insertion-based but we
  // don't want callers depending on JSON authoring order.
  for (const animId of Object.keys(character.animations ?? {}).sort()) {
    const anim = character.animations?.[animId];
    if (!anim) continue;
    for (const f of anim.frames) {
      if (!seen.has(f.sprite)) {
        seen.add(f.sprite);
        out.push(f.sprite);
      }
    }
  }
  return out;
}

/** Sprite keys referenced by animations but absent from the atlas. */
export function findMissingSprites(character: Character): string[] {
  const frames = character.spriteAtlas?.frames ?? {};
  return collectReferencedSprites(character).filter((key) => !(key in frames));
}

/**
 * Throw at load time (not at tick/render) if a character declares an atlas
 * that doesn't cover every referenced sprite. A character with no spriteAtlas
 * is fine — the renderer falls back to procedural shapes.
 */
export function assertAtlasCoverage(character: Character): void {
  if (!character.spriteAtlas) return;
  const missing = findMissingSprites(character);
  if (missing.length > 0) {
    throw new Error(
      `Character "${character.meta.id}" atlas is missing sprites: ${missing.join(', ')}`,
    );
  }
}
