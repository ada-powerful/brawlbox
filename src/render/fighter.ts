import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Character } from '../engine/schema.ts';
import type { Player } from '../engine/world.ts';
import { GROUND_Y_SCREEN } from '../engine/world.ts';
import { lerp } from '../engine/vec.ts';
import { animFrameAt } from '../runtime/atlas.ts';
import { poseFor } from './poses.ts';

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

  // Per-axis scale applied to sprite frames. Y maps the packed cell to the
  // character's world height; X is driven by size.width so a wider body renders
  // wider (not just a wider hitbox). 1 = no scale (procedural path). See ctor.
  private readonly spriteScaleX: number = 1;
  private readonly spriteScaleY: number = 1;

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
      const cellH = Object.values(opts.textures)[0]?.frame.height ?? opts.character.size.height;
      // Y = cell → world height (overall size). X = width as girth: at the
      // canonical creator body proportion (kfm2 60×110) X equals Y (undistorted);
      // a wider/narrower size.width then stretches the sprite horizontally.
      const NEUTRAL_BODY_RATIO = 60 / 110; // canonical width:height (kfm2 base)
      this.spriteScaleY = opts.character.size.height / cellH;
      this.spriteScaleX = opts.character.size.width / (cellH * NEUTRAL_BODY_RATIO);
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
    // Draw a stick figure from the pose: w = stance width (leg spread), h = body
    // height, leanX = upper-body lean, arm = forward limb extension (strike /
    // grab / guard), colour = action group. Local space has feet at y=0 and "up"
    // as -y; +x is "forward" because the view is flipped by facing in update().
    const { w, h, leanX, color, arm } = poseFor(animId, frame, this.baseColor);
    const lw = Math.max(4, h * 0.05);
    const headR = Math.max(7, h * 0.1);
    const hip = { x: leanX * 0.3, y: -h * 0.42 };
    const neck = { x: leanX * 0.85, y: -h * 0.82 };
    const headY = neck.y - headR - 3;
    const frontFoot = { x: w / 2, y: 0 };
    const backFoot = { x: -w / 2, y: 0 };
    // Arm reaches forward when extended, otherwise hangs by the hip.
    const frontHand =
      arm > 0 ? { x: neck.x + arm + 6, y: -h * 0.55 } : { x: neck.x + 8, y: -h * 0.14 };
    const backHand = { x: neck.x - 8, y: -h * 0.16 };

    g.clear();
    g.moveTo(hip.x, hip.y)
      .lineTo(neck.x, neck.y)
      .moveTo(hip.x, hip.y)
      .lineTo(frontFoot.x, frontFoot.y)
      .moveTo(hip.x, hip.y)
      .lineTo(backFoot.x, backFoot.y)
      .moveTo(neck.x, neck.y)
      .lineTo(frontHand.x, frontHand.y)
      .moveTo(neck.x, neck.y)
      .lineTo(backHand.x, backHand.y)
      .stroke({ width: lw, color, cap: 'round', join: 'round' });
    g.circle(leanX, headY, headR).fill({ color });
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
    // Procedural shapes are authored at world size (scale 1); sprite cells are
    // scaled per-axis (height → Y, width → X). Facing flips along x.
    this.view.scale.set(curr.facing * this.spriteScaleX, this.spriteScaleY);
  }
}
