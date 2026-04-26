import { Graphics } from 'pixi.js';
import type { Player } from '../engine/world.ts';
import { GROUND_Y_SCREEN } from '../engine/world.ts';
import { lerp } from '../engine/vec.ts';

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
    const { w, h, leanX, color } = frameShape(animId, frame, this.baseColor);
    this.gfx.clear();
    this.gfx
      .poly([-w / 2 + leanX, -h, w / 2 + leanX, -h, w / 2 - leanX, 0, -w / 2 - leanX, 0])
      .fill({ color });
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
    this.gfx.scale.x = curr.facing;
  }
}
