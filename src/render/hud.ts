import { Container, Graphics, Text } from 'pixi.js';
import type { World } from '../engine/world.ts';
import { STAGE_WIDTH } from '../engine/world.ts';

const TICKS_PER_SECOND = 60;

const BAR_HEIGHT = 22;
const BAR_Y = 30;
const BAR_PAD = 30;
/** Reserved center space for the round timer between the two bars. */
const CENTER_GAP = 120;
/** Each bar fills the stage width minus the side padding and center gap. */
const BAR_WIDTH = (STAGE_WIDTH - 2 * BAR_PAD - CENTER_GAP) / 2;
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

export class RoundTimer {
  readonly gfx: Container;
  private readonly text: Text;
  private readonly unlimited: boolean;

  /** `unlimited` makes the clock read "∞" forever — used by the creator playtest
   *  so new users can experiment without the round ever timing out. */
  constructor(unlimited = false) {
    this.unlimited = unlimited;
    this.gfx = new Container();
    this.text = new Text({
      text: '',
      style: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 32,
        fill: 0xffffff,
        fontWeight: 'bold',
        align: 'center',
      },
    });
    this.text.anchor.set(0.5, 0);
    this.text.x = STAGE_WIDTH / 2;
    this.text.y = 24;
    this.gfx.addChild(this.text);
  }

  update(world: World): void {
    if (this.unlimited) {
      this.text.text = '∞';
      return;
    }
    // Show whole seconds, rounding up so the clock reads "30" on tick 0 and
    // only hits "0" on the final tick.
    this.text.text = String(Math.ceil(world.roundTime / TICKS_PER_SECOND));
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
    // roundTime only reaches 0 when the clock runs out — a KO ends the match
    // before the timer decrements, so this cleanly distinguishes the two.
    const timeUp = world.roundTime === 0;
    const result = world.winner !== null ? `PLAYER ${world.winner + 1} WINS` : 'DRAW';
    this.text.text = timeUp
      ? `TIME UP\n${result}\nPress R to restart`
      : `${result}\nPress R to restart`;
  }
}
