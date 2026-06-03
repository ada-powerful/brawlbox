// Idle-stance preview: shows ONE fighter looping its `stand` animation, with a
// translucent box marking its size.width × size.height. No engine sim runs — it
// drives the renderer's display state directly (like mountGallery). `setCharacter`
// swaps in an updated character live (used by the Attributes editor's preview, so
// size/sprite tweaks are reflected before they're saved).
import { Container, Graphics } from 'pixi.js';
import type { Character } from '../engine/schema.ts';
import { GROUND_Y_SCREEN, STAGE_HEIGHT, STAGE_WIDTH, type Player } from '../engine/world.ts';
import { startApp } from '../render/app.ts';
import { FighterRenderer } from '../render/fighter.ts';

export interface IdleOptions {
  character: Character;
  /** When set (and the character has an atlas), render the character's sprites. */
  atlasUrl?: string;
  color: number;
}

export interface IdleHandle {
  /** Swap in an updated character (same atlas) and re-render immediately. */
  setCharacter: (character: Character) => void;
  destroy: () => void;
}

const FRAME_TICKS = 10; // ticks per stand-animation frame (gentle idle loop)

function idlePlayer(character: Character, animFrame: number): Player {
  return {
    characterId: character.meta.id,
    pos: { x: STAGE_WIDTH / 2, y: 0 },
    vel: { x: 0, y: 0 },
    facing: 1,
    stateId: 'stand',
    stateTime: 0,
    ctrl: true,
    animId: 'stand',
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
    stun: 0,
  };
}

export async function mountIdle(mount: HTMLElement, opts: IdleOptions): Promise<IdleHandle> {
  const { atlasUrl, color } = opts;

  let textures: Record<string, import('pixi.js').Texture> | undefined;
  if (atlasUrl && opts.character.spriteAtlas) {
    const { loadAtlasTextures } = await import('../runtime/assets.ts');
    textures = await loadAtlasTextures(atlasUrl, opts.character.spriteAtlas.frames);
  }

  const app = await startApp(mount);
  const stage = app.stage;

  // The match stage is 960×540 and a fighter is only ~110px tall, so at world
  // size it looks tiny in the preview. Put the whole scene in a camera that
  // zooms in on the fighter's feet, framing it large and centered.
  const scene = new Container();
  scene.pivot.set(STAGE_WIDTH / 2, GROUND_Y_SCREEN); // feet center on the ground
  scene.x = STAGE_WIDTH / 2;
  scene.y = STAGE_HEIGHT * 0.9; // ground sits near the bottom, body fills upward
  stage.addChild(scene);

  const ground = new Graphics();
  ground.rect(0, GROUND_Y_SCREEN, STAGE_WIDTH, 2).fill({ color: 0x333842 });
  scene.addChild(ground);

  // Behind the fighter: a translucent outline of its collision size, so width /
  // height edits are visible even before sprites exist (procedural figures don't
  // scale with size on their own).
  const sizeBox = new Graphics();
  scene.addChild(sizeBox);

  const fighterLayer = new Container();
  scene.addChild(fighterLayer);

  let current = opts.character;
  let renderer = new FighterRenderer(color, { character: current, textures });
  fighterLayer.addChild(renderer.view);

  // Generous fixed zoom so a default-height fighter fills most of the frame;
  // backed off only for unusually tall bodies so they never clip. Height edits
  // stay visible (the on-screen size grows with height up to the cap), and width
  // edits always scale.
  const BASE_ZOOM = 3.2;
  const applyZoom = (): void => {
    const zoom = Math.min(BASE_ZOOM, (0.88 * STAGE_HEIGHT) / Math.max(1, current.size.height));
    scene.scale.set(zoom);
  };

  let held = 0;
  let raf = 0;

  const standFrames = (): number => current.animations?.['stand']?.frames.length ?? 2;

  const drawSizeBox = (): void => {
    const w = current.size.width;
    const h = current.size.height;
    sizeBox.clear();
    sizeBox
      .rect(STAGE_WIDTH / 2 - w / 2, GROUND_Y_SCREEN - h, w, h)
      .stroke({ width: 1, color: 0x6b7280, alpha: 0.5 });
  };

  const draw = (): void => {
    const animFrame = Math.floor(held / FRAME_TICKS) % standFrames();
    const p = idlePlayer(current, animFrame);
    renderer.update(p, p, 1);
  };

  const frame = (): void => {
    held++;
    draw();
    raf = requestAnimationFrame(frame);
  };

  applyZoom();
  drawSizeBox();
  draw();
  raf = requestAnimationFrame(frame);

  return {
    setCharacter: (next: Character): void => {
      current = next;
      // Rebuild the renderer so a changed size.height re-derives the sprite scale
      // (it's fixed at construction). Textures are reused — the atlas is unchanged
      // for an attribute edit.
      fighterLayer.removeChild(renderer.view);
      renderer.view.destroy();
      renderer = new FighterRenderer(color, { character: current, textures });
      fighterLayer.addChild(renderer.view);
      applyZoom();
      drawSizeBox();
      draw();
    },
    destroy: (): void => {
      cancelAnimationFrame(raf);
      app.destroy(true, { children: true });
    },
  };
}
