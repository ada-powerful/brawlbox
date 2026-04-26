import { Graphics } from 'pixi.js';
import type { Player } from '../engine/world.ts';
import { GROUND_Y_SCREEN } from '../engine/world.ts';
import { lerp } from '../engine/vec.ts';

export class FighterRenderer {
  readonly gfx: Graphics;

  constructor(color: number) {
    this.gfx = new Graphics().rect(-30, -100, 60, 100).fill({ color });
  }

  update(prev: Player, curr: Player, alpha: number): void {
    const x = lerp(prev.pos.x, curr.pos.x, alpha);
    const y = lerp(prev.pos.y, curr.pos.y, alpha);
    this.gfx.x = x;
    this.gfx.y = GROUND_Y_SCREEN - y;
  }
}
