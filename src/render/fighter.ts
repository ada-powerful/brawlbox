import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Character } from '../engine/schema.ts';
import type { Player } from '../engine/world.ts';
import { GROUND_Y_SCREEN } from '../engine/world.ts';
import { lerp } from '../engine/vec.ts';
import { animFrameAt } from '../runtime/atlas.ts';

interface FrameShape {
  w: number;
  h: number;
  leanX: number;
  color: number;
}

function frameShape(animId: string, frame: number, baseColor: number): FrameShape {
  switch (animId) {
    case 'walk':
      return { w: 60, h: 100, leanX: frame === 0 ? -4 : 4, color: baseColor };
    case 'jump.rise':
      return { w: 48, h: 110, leanX: 0, color: baseColor };
    case 'jump.fall':
      return { w: 72, h: 88, leanX: 0, color: baseColor };
    case 'punch':
      if (frame === 0) return { w: 56, h: 100, leanX: -4, color: baseColor };
      if (frame === 1) return { w: 80, h: 100, leanX: 12, color: 0xffffff };
      return { w: 60, h: 100, leanX: 0, color: baseColor };
    case 'hit.stand':
      return { w: 60, h: 96, leanX: -10, color: 0xff5555 };
    case 'hit.air':
      return { w: 60, h: 90, leanX: -14, color: 0xff5555 };
    case 'ko':
      return { w: 100, h: 30, leanX: 0, color: 0x666666 };
    case 'stand':
    default:
      return { w: 60, h: 100, leanX: 0, color: baseColor };
  }
}

export interface FighterRendererOpts {
  /** When both are provided, render real atlas sprites; otherwise fall back to procedural shapes. */
  character?: Character;
  textures?: Record<string, Texture>;
}

/**
 * Draws one fighter. Sprite-backed when an atlas is supplied (M2.0+), otherwise
 * the phase-1 procedural silhouette. The active display object is `view`.
 */
export class FighterRenderer {
  readonly view: Container;
  private readonly baseColor: number;

  // Sprite path.
  private readonly sprite?: Sprite;
  private readonly character?: Character;
  private readonly textures?: Record<string, Texture>;

  // Procedural fallback path.
  private readonly gfx?: Graphics;

  private lastAnim = '';
  private lastFrame = -1;

  constructor(color: number, opts: FighterRendererOpts = {}) {
    this.baseColor = color;
    if (opts.character && opts.textures) {
      this.character = opts.character;
      this.textures = opts.textures;
      this.sprite = new Sprite();
      this.sprite.anchor.set(0.5, 1); // feet-center, matches world feet anchor
      // AI atlases are full-color art, so render them as-is (no player tint).
      this.view = this.sprite;
    } else {
      this.gfx = new Graphics();
      this.view = this.gfx;
    }
    this.drawFrame('stand', 0);
  }

  private drawFrame(animId: string, frame: number): void {
    if (this.sprite && this.character && this.textures) {
      const af = animFrameAt(this.character, animId, frame);
      const tex = af ? this.textures[af.sprite] : undefined;
      if (tex) this.sprite.texture = tex;
      return;
    }
    const g = this.gfx;
    if (!g) return;
    const { w, h, leanX, color } = frameShape(animId, frame, this.baseColor);
    g.clear();
    g.poly([-w / 2 + leanX, -h, w / 2 + leanX, -h, w / 2 - leanX, 0, -w / 2 - leanX, 0]).fill({
      color,
    });
  }

  update(prev: Player, curr: Player, alpha: number): void {
    if (curr.animId !== this.lastAnim || curr.animFrame !== this.lastFrame) {
      this.drawFrame(curr.animId, curr.animFrame);
      this.lastAnim = curr.animId;
      this.lastFrame = curr.animFrame;
    }
    const x = lerp(prev.pos.x, curr.pos.x, alpha);
    const y = lerp(prev.pos.y, curr.pos.y, alpha);
    this.view.x = x;
    this.view.y = GROUND_Y_SCREEN - y;
    this.view.scale.x = curr.facing;
  }
}
