import { Container, Graphics, Text } from 'pixi.js';
import type { World } from '../engine/world.ts';
import { STAGE_WIDTH } from '../engine/world.ts';

const BAR_WIDTH = 300;
const BAR_HEIGHT = 22;
const BAR_Y = 30;
const BAR_PAD = 30;
const MAX_LIFE = 1000;

export class HealthBars {
  readonly gfx: Graphics;

  constructor() {
    this.gfx = new Graphics();
  }

  update(world: World): void {
    this.gfx.clear();
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i];
      if (!p) continue;
      const ratio = Math.max(0, Math.min(1, p.life / MAX_LIFE));
      const color = i === 0 ? 0xff5577 : 0x55aaff;
      const flipped = i === 1;
      const xLeft = flipped ? STAGE_WIDTH - BAR_PAD - BAR_WIDTH : BAR_PAD;
      const fillWidth = BAR_WIDTH * ratio;
      const fillX = flipped ? xLeft + (BAR_WIDTH - fillWidth) : xLeft;

      this.gfx.rect(xLeft, BAR_Y, BAR_WIDTH, BAR_HEIGHT).fill({ color: 0x222222 });
      if (fillWidth > 0) {
        this.gfx.rect(fillX, BAR_Y, fillWidth, BAR_HEIGHT).fill({ color });
      }
      this.gfx.rect(xLeft, BAR_Y, BAR_WIDTH, BAR_HEIGHT).stroke({
        color: 0xffffff,
        width: 1,
      });
    }
  }
}

export class MatchOverlay {
  readonly gfx: Container;
  private readonly text: Text;

  constructor() {
    this.gfx = new Container();
    this.text = new Text({
      text: '',
      style: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 36,
        fill: 0xffffff,
        fontWeight: 'bold',
        align: 'center',
      },
    });
    this.text.anchor.set(0.5, 0.5);
    this.text.x = STAGE_WIDTH / 2;
    this.text.y = 200;
    this.gfx.addChild(this.text);
    this.gfx.visible = false;
  }

  update(world: World): void {
    if (!world.matchOver) {
      this.gfx.visible = false;
      return;
    }
    this.gfx.visible = true;
    if (world.winner !== null) {
      this.text.text = `PLAYER ${world.winner + 1} WINS\nPress R to restart`;
    } else {
      this.text.text = `DRAW\nPress R to restart`;
    }
  }
}
