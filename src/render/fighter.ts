import { Graphics } from 'pixi.js';
import type { Player } from '../engine/world.ts';
import { GROUND_Y_SCREEN } from '../engine/world.ts';
import { lerp } from '../engine/vec.ts';

interface FrameShape {
  w: number;
  h: number;
  leanX: number;
  tint?: number;
}

function frameShape(animId: string, frame: number): FrameShape {
  switch (animId) {
    case 'walk':
      return { w: 60, h: 100, leanX: frame === 0 ? -4 : 4 };
    case 'jump.rise':
      return { w: 48, h: 110, leanX: 0 };
    case 'jump.fall':
      return { w: 72, h: 88, leanX: 0 };
    case 'stand':
    default:
      return { w: 60, h: 100, leanX: 0 };
  }
}

export class FighterRenderer {
  readonly gfx: Graphics;
  private readonly baseColor: number;
  private lastAnim = '';
  private lastFrame = -1;

  constructor(color: number) {
    this.gfx = new Graphics();
    this.baseColor = color;
    this.drawFrame('stand', 0);
  }

  private drawFrame(animId: string, frame: number): void {
    const { w, h, leanX } = frameShape(animId, frame);
    this.gfx.clear();
    this.gfx
      .poly([-w / 2 + leanX, -h, w / 2 + leanX, -h, w / 2 - leanX, 0, -w / 2 - leanX, 0])
      .fill({ color: this.baseColor });
  }

  update(prev: Player, curr: Player, alpha: number): void {
    if (curr.animId !== this.lastAnim || curr.animFrame !== this.lastFrame) {
      this.drawFrame(curr.animId, curr.animFrame);
      this.lastAnim = curr.animId;
      this.lastFrame = curr.animFrame;
    }
    const x = lerp(prev.pos.x, curr.pos.x, alpha);
    const y = lerp(prev.pos.y, curr.pos.y, alpha);
    this.gfx.x = x;
    this.gfx.y = GROUND_Y_SCREEN - y;
  }
}
