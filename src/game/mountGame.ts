// Mounts a playable match into a DOM element. Parameterized by the two fighters
// so the creator can run base-vs-generated playtests. The engine itself stays
// untouched — this is just the render/loop wiring that main.ts used to hold.
import type { Character } from '../engine/schema.ts';
import { tick } from '../engine/tick.ts';
import { createWorld } from '../engine/world.ts';
import { pollInputs, startKeyboard } from '../input/keyboard.ts';
import { startApp } from '../render/app.ts';
import { DebugOverlay } from '../render/debug.ts';
import { FighterRenderer } from '../render/fighter.ts';
import { HealthBars, MatchOverlay } from '../render/hud.ts';
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
  destroy: () => void;
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
  app.stage.addChild(createStage());

  const r1 = new FighterRenderer(p1.color, { character: p1.character, textures: tex1 });
  const r2 = new FighterRenderer(p2.color, { character: p2.character, textures: tex2 });
  app.stage.addChild(r1.view);
  app.stage.addChild(r2.view);

  const healthBars = new HealthBars();
  app.stage.addChild(healthBars.gfx);
  const matchOverlay = new MatchOverlay();
  app.stage.addChild(matchOverlay.gfx);
  const debugOverlay = new DebugOverlay();
  app.stage.addChild(debugOverlay.gfx);

  startKeyboard(window);

  const handle = startLoop({
    createWorld: () => createWorld(p1.character.meta.id, p2.character.meta.id),
    pollInputs,
    tick: (w, inp) => tick(w, characters, inp),
    render: (prev, curr, alpha) => {
      const a = prev.players[0];
      const b = curr.players[0];
      const c = prev.players[1];
      const d = curr.players[1];
      if (a && b) r1.update(a, b, alpha);
      if (c && d) r2.update(c, d, alpha);
      healthBars.update(curr);
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
    destroy: () => {
      handle.stop();
      window.removeEventListener('keydown', onKey);
      app.destroy(true, { children: true });
    },
  };
}
