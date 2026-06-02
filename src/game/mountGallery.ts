// Action gallery: cycles the SELECTED character through its OWN animation set so
// you can review that character's actions one by one. Renders the way the match
// does — the character's sprite when it has an atlas, else the procedural
// colour-coded stick figure. Each action is labelled by id + action group. No
// engine sim runs; it drives the renderer's display state directly.
import { Container, Graphics, Text } from 'pixi.js';
import type { Character } from '../engine/schema.ts';
import { GROUND_Y_SCREEN, STAGE_WIDTH, type Player } from '../engine/world.ts';
import { startApp } from '../render/app.ts';
import { FighterRenderer } from '../render/fighter.ts';
import { actionGroup, GROUP_COLORS, type ActionGroup } from '../render/poses.ts';

export interface GalleryOptions {
  character: Character;
  /** When set (and the character has an atlas), render the character's sprites. */
  atlasUrl?: string;
  color: number;
}

export interface GalleryHandle {
  next: () => void;
  prev: () => void;
  togglePlay: () => void;
  destroy: () => void;
}

const HOLD_TICKS = 72;
const ACTIVE_AT = 36;

// Cluster the character's actions by group, then by id, for a readable walk.
const GROUP_ORDER: ActionGroup[] = [
  'movement',
  'attack',
  'special',
  'super',
  'throw',
  'guard',
  'hurt',
  'thrown',
  'system',
];

interface GalleryAction {
  id: string;
  group: ActionGroup;
}

function actionList(character: Character): GalleryAction[] {
  const items = Object.keys(character.animations ?? {}).map((id) => ({ id, group: actionGroup(id) }));
  items.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return items.length > 0 ? items : [{ id: 'stand', group: 'movement' }];
}

/** Actions performed in the air — lifted off the ground in the gallery so they read distinctly. */
function isAirborne(id: string): boolean {
  return /air|jump/.test(id) || id === 'fall';
}

function groupColor(group: ActionGroup, base: number): number {
  return group === 'movement' ? base : GROUP_COLORS[group];
}

function staticPlayer(character: Character, animId: string, animFrame: number): Player {
  return {
    characterId: character.meta.id,
    pos: { x: STAGE_WIDTH / 2, y: 0 },
    vel: { x: 0, y: 0 },
    facing: 1,
    stateId: animId,
    stateTime: 0,
    ctrl: false,
    animId,
    animFrame,
    animTime: 0,
    inputBuffer: [],
    life: 1000,
    power: 0,
    halfWidth: character.size.width / 2,
    hitPause: 0,
    activeHitDef: null,
    activeThrow: null,
    bind: null,
    moveHit: false,
    moveGuarded: false,
    otgHits: 0,
  };
}

export async function mountGallery(mount: HTMLElement, opts: GalleryOptions): Promise<GalleryHandle> {
  const { character, atlasUrl, color } = opts;

  let textures: Record<string, import('pixi.js').Texture> | undefined;
  if (atlasUrl && character.spriteAtlas) {
    const { loadAtlasTextures } = await import('../runtime/assets.ts');
    textures = await loadAtlasTextures(atlasUrl, character.spriteAtlas.frames);
  }

  const actions = actionList(character);

  const app = await startApp(mount);
  const stage = app.stage;

  const ground = new Graphics();
  ground.rect(0, GROUND_Y_SCREEN, STAGE_WIDTH, 2).fill({ color: 0x333842 });
  stage.addChild(ground);

  const fighterLayer = new Container();
  stage.addChild(fighterLayer);
  // Sprite-backed when the character has an atlas; procedural stick figure otherwise.
  const renderer = new FighterRenderer(color, { character, textures });
  fighterLayer.addChild(renderer.view);

  const title = new Text({
    text: '',
    style: { fontFamily: 'ui-monospace, monospace', fontSize: 22, fill: 0xffffff, align: 'center' },
  });
  title.anchor.set(0.5, 0);
  title.x = STAGE_WIDTH / 2;
  title.y = 24;
  stage.addChild(title);

  const subtitle = new Text({
    text: '',
    style: { fontFamily: 'ui-monospace, monospace', fontSize: 13, fill: 0x9a9aa5, align: 'center' },
  });
  subtitle.anchor.set(0.5, 0);
  subtitle.x = STAGE_WIDTH / 2;
  subtitle.y = 54;
  stage.addChild(subtitle);

  const swatch = new Graphics();
  stage.addChild(swatch);

  let index = 0;
  let playing = true;
  let raf = 0;
  let held = 0;

  const draw = (): void => {
    const action = actions[index]!;
    const animFrame = held >= ACTIVE_AT ? 1 : 0;
    const p = staticPlayer(character, action.id, animFrame);
    if (isAirborne(action.id)) p.pos.y = 130;
    renderer.update(p, p, 1);

    const c = groupColor(action.group, color);
    const kind = textures ? 'sprite' : 'procedural';
    title.text = action.id;
    title.style.fill = c;
    subtitle.text = `${index + 1}/${actions.length}  ·  ${character.meta.name}  ·  group: ${action.group}  ·  ${kind}`;
    swatch.clear();
    swatch.rect(STAGE_WIDTH / 2 - 60, 84, 120, 6).fill({ color: c });
  };

  const frame = (): void => {
    if (playing) {
      held++;
      if (held >= HOLD_TICKS) {
        held = 0;
        index = (index + 1) % actions.length;
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  draw();
  raf = requestAnimationFrame(frame);

  return {
    next: () => {
      index = (index + 1) % actions.length;
      held = 0;
      draw();
    },
    prev: () => {
      index = (index - 1 + actions.length) % actions.length;
      held = 0;
      draw();
    },
    togglePlay: () => {
      playing = !playing;
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      app.destroy(true, { children: true });
    },
  };
}
