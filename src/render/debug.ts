import { Container, Graphics, Text } from 'pixi.js';
import { getActiveFrame } from '../engine/animation.ts';
import { translateBox } from '../engine/collision.ts';
import type { AABB, Character } from '../engine/schema.ts';
import type { Player, World } from '../engine/world.ts';
import { GROUND_Y_SCREEN, STAGE_WIDTH } from '../engine/world.ts';

const HURT_COLOR = 0x55aaff;
const HIT_COLOR = 0xff5555;
const BODY_COLOR = 0xffaa00;

export class DebugOverlay {
  readonly gfx: Container;
  private readonly boxes: Graphics;
  private readonly texts: Text[];

  constructor(playerCount = 2) {
    this.gfx = new Container();
    this.boxes = new Graphics();
    this.gfx.addChild(this.boxes);

    this.texts = [];
    for (let i = 0; i < playerCount; i++) {
      const t = new Text({
        text: '',
        style: {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          fill: 0xffffff,
          align: i === 0 ? 'left' : 'right',
          lineHeight: 14,
        },
      });
      t.x = i === 0 ? 12 : STAGE_WIDTH - 12;
      t.y = 60;
      t.anchor.set(i === 0 ? 0 : 1, 0);
      this.gfx.addChild(t);
      this.texts.push(t);
    }

    this.gfx.visible = false;
  }

  toggle(): void {
    this.gfx.visible = !this.gfx.visible;
    if (!this.gfx.visible) {
      this.boxes.clear();
      for (const t of this.texts) t.text = '';
    }
  }

  update(world: World, characters: Record<string, Character>): void {
    if (!this.gfx.visible) return;

    this.boxes.clear();

    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i];
      if (!p) continue;
      const character = characters[p.characterId];
      const text = this.texts[i];
      if (!character || !text) continue;

      this.drawBodyBox(p, character);

      const frame = getActiveFrame(p, character);
      if (frame) {
        for (const hb of frame.hurtboxes) {
          this.drawBox(hb, p, HURT_COLOR);
        }
        for (const hb of frame.hitboxes) {
          this.drawBox(hb, p, HIT_COLOR);
        }
      }

      text.text = formatPlayerState(p, i);
    }
  }

  private drawBox(box: AABB, player: Player, color: number): void {
    const w = translateBox(box, player);
    const screenY = GROUND_Y_SCREEN - w.maxY;
    const screenW = w.maxX - w.minX;
    const screenH = w.maxY - w.minY;
    this.boxes
      .rect(w.minX, screenY, screenW, screenH)
      .fill({ color, alpha: 0.25 })
      .stroke({ color, width: 1.5 });
  }

  private drawBodyBox(p: Player, character: Character): void {
    const w = character.size.width;
    const h = character.size.height;
    const minX = p.pos.x - w / 2;
    const screenY = GROUND_Y_SCREEN - (p.pos.y + h);
    this.boxes.rect(minX, screenY, w, h).stroke({ color: BODY_COLOR, width: 1, alpha: 0.6 });
  }
}

function formatPlayerState(p: Player, index: number): string {
  const lines = [
    `P${index + 1}  state: ${p.stateId} t:${p.stateTime}`,
    `anim: ${p.animId}[${p.animFrame}] t:${p.animTime}`,
    `pos: ${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}`,
    `vel: ${p.vel.x.toFixed(2)}, ${p.vel.y.toFixed(2)}`,
    `ctrl:${p.ctrl ? 1 : 0}  life:${p.life}  facing:${p.facing}`,
    `pause:${p.hitPause}  hit:${p.activeHitDef ? 'Y' : 'N'}`,
  ];
  return lines.join('\n');
}
