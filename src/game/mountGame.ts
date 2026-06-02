// Mounts a playable match into a DOM element. Parameterized by the two fighters
// so the creator can run base-vs-generated playtests. The engine itself stays
// untouched — this is just the render/loop wiring that main.ts used to hold.
import { Container } from 'pixi.js';
import type { Character } from '../engine/schema.ts';
import { tick } from '../engine/tick.ts';
import { createWorld, GROUND_Y_SCREEN, STAGE_WIDTH, type World } from '../engine/world.ts';
import { lerp } from '../engine/vec.ts';
import { pollInputs, startKeyboard } from '../input/keyboard.ts';
import { startApp } from '../render/app.ts';
import { DebugOverlay } from '../render/debug.ts';
import { FighterRenderer } from '../render/fighter.ts';
import { HealthBars, MatchOverlay, RoundTimer } from '../render/hud.ts';
import { createStage } from '../render/stage.ts';
import { assertAtlasCoverage } from '../runtime/atlas.ts';
import { loadAtlasTextures } from '../runtime/assets.ts';
import { startLoop } from '../runtime/loop.ts';

export interface FighterSpec {
  character: Character;
  /** Resolved atlas URL; omit to render with procedural shapes. */
  atlasUrl?: string;
  color: number;
}

export interface MountOptions {
  p1: FighterSpec;
  p2: FighterSpec;
}

export interface GameHandle {
  reset: () => void;
  toggleDebug: () => void;
  /** Freeze the round timer so the match never times out — for continuous debugging. */
  setFreezeTimer: (on: boolean) => void;
  destroy: () => void;
}

// Follow-camera tuning. The view zooms in (up to MAX_ZOOM) when the fighters
// are close and eases out to the full stage (MIN_ZOOM = 1) as they separate, so
// both always stay framed. MARGIN is the world-px of breathing room kept around
// the pair; SMOOTH is the per-frame easing toward the target transform.
const MIN_ZOOM = 1;
const MAX_ZOOM = 1.9;
const MARGIN = 360;
const SMOOTH = 0.18;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Build the per-frame camera updater. Keeps its own eased {scale, x, y} state so
 * the zoom doesn't snap as the fighters move. Anchors the ground line at a fixed
 * screen y and pans horizontally to center the pair, clamped so the view never
 * shows past the stage edges.
 */
function updateCameraFn(camera: Container): (prev: World, curr: World, alpha: number) => void {
  let s = 1;
  let x = 0;
  let y = 0;
  let init = false;

  return (prev, curr, alpha) => {
    const x1 = lerp(prev.players[0]?.pos.x ?? 0, curr.players[0]?.pos.x ?? 0, alpha);
    const x2 = lerp(prev.players[1]?.pos.x ?? 0, curr.players[1]?.pos.x ?? 0, alpha);
    const sep = Math.abs(x1 - x2);
    const mid = (x1 + x2) / 2;

    const targetS = clamp(STAGE_WIDTH / (sep + MARGIN), MIN_ZOOM, MAX_ZOOM);
    // Center the pair, then clamp so [0, STAGE_WIDTH] never leaves the viewport.
    const targetX = clamp(STAGE_WIDTH / 2 - mid * targetS, STAGE_WIDTH * (1 - targetS), 0);
    const targetY = GROUND_Y_SCREEN * (1 - targetS); // keeps the ground line fixed

    if (!init) {
      s = targetS;
      x = targetX;
      y = targetY;
      init = true;
    } else {
      s += (targetS - s) * SMOOTH;
      x += (targetX - x) * SMOOTH;
      y += (targetY - y) * SMOOTH;
      // Re-clamp against the eased zoom so mid-transition never bleeds past edges.
      x = clamp(x, STAGE_WIDTH * (1 - s), 0);
    }

    camera.scale.set(s);
    camera.x = x;
    camera.y = y;
  };
}

export async function mountGame(mount: HTMLElement, opts: MountOptions): Promise<GameHandle> {
  const { p1, p2 } = opts;
  for (const f of [p1, p2]) assertAtlasCoverage(f.character);

  // Engine character registry keyed by id. Distinct ids => both registered.
  const characters: Record<string, Character> = {
    [p1.character.meta.id]: p1.character,
    [p2.character.meta.id]: p2.character,
  };

  const [tex1, tex2] = await Promise.all([
    p1.atlasUrl && p1.character.spriteAtlas
      ? loadAtlasTextures(p1.atlasUrl, p1.character.spriteAtlas.frames)
      : Promise.resolve(undefined),
    p2.atlasUrl && p2.character.spriteAtlas
      ? loadAtlasTextures(p2.atlasUrl, p2.character.spriteAtlas.frames)
      : Promise.resolve(undefined),
  ]);

  const app = await startApp(mount);

  // Gameplay layer (stage + fighters + debug boxes) lives under a camera so it
  // can be zoomed/panned to frame the action. The HUD stays in screen space.
  const camera = new Container();
  app.stage.addChild(camera);
  camera.addChild(createStage());

  const r1 = new FighterRenderer(p1.color, { character: p1.character, textures: tex1 });
  const r2 = new FighterRenderer(p2.color, { character: p2.character, textures: tex2 });
  camera.addChild(r1.view);
  camera.addChild(r2.view);
  const debugOverlay = new DebugOverlay();
  camera.addChild(debugOverlay.gfx);

  const healthBars = new HealthBars();
  app.stage.addChild(healthBars.gfx);
  const roundTimer = new RoundTimer();
  app.stage.addChild(roundTimer.gfx);
  const matchOverlay = new MatchOverlay();
  app.stage.addChild(matchOverlay.gfx);

  startKeyboard(window);

  const updateCamera = updateCameraFn(camera);

  // When frozen, the round timer is restored after each tick so it never reaches
  // zero and times out the match — lets the sandbox run a round indefinitely.
  let freezeTimer = false;

  const handle = startLoop({
    createWorld: () => createWorld(p1.character.meta.id, p2.character.meta.id),
    pollInputs,
    tick: (w, inp) => {
      const before = w.roundTime;
      const next = tick(w, characters, inp);
      if (freezeTimer) next.roundTime = before;
      return next;
    },
    render: (prev, curr, alpha) => {
      const a = prev.players[0];
      const b = curr.players[0];
      const c = prev.players[1];
      const d = curr.players[1];
      if (a && b) r1.update(a, b, alpha);
      if (c && d) r2.update(c, d, alpha);
      updateCamera(prev, curr, alpha);
      healthBars.update(curr);
      roundTimer.update(curr);
      matchOverlay.update(curr);
      debugOverlay.update(curr, characters);
    },
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyR') handle.reset();
    if (e.code === 'F1' || e.code === 'Backquote') {
      e.preventDefault();
      debugOverlay.toggle();
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    reset: () => handle.reset(),
    toggleDebug: () => debugOverlay.toggle(),
    setFreezeTimer: (on: boolean) => {
      freezeTimer = on;
    },
    destroy: () => {
      handle.stop();
      window.removeEventListener('keydown', onKey);
      app.destroy(true, { children: true });
    },
  };
}
