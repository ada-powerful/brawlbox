import baseChar from '../characters/base/character.json' with { type: 'json' };
import { tick } from './engine/tick.ts';
import { parseCharacter } from './engine/schema.ts';
import { createWorld } from './engine/world.ts';
import { pollInputs, startKeyboard } from './input/keyboard.ts';
import { startApp } from './render/app.ts';
import { DebugOverlay } from './render/debug.ts';
import { FighterRenderer } from './render/fighter.ts';
import { HealthBars, MatchOverlay } from './render/hud.ts';
import { createStage } from './render/stage.ts';
import { startLoop } from './runtime/loop.ts';

async function main(): Promise<void> {
  const mount = document.getElementById('app');
  if (!mount) throw new Error('mount #app missing');

  const characters = { base: parseCharacter(baseChar) };

  const app = await startApp(mount);
  app.stage.addChild(createStage());

  const p1 = new FighterRenderer(0xff5577);
  const p2 = new FighterRenderer(0x55aaff);
  app.stage.addChild(p1.gfx);
  app.stage.addChild(p2.gfx);

  const healthBars = new HealthBars();
  app.stage.addChild(healthBars.gfx);
  const matchOverlay = new MatchOverlay();
  app.stage.addChild(matchOverlay.gfx);
  const debugOverlay = new DebugOverlay();
  app.stage.addChild(debugOverlay.gfx);

  startKeyboard(window);

  const handle = startLoop({
    createWorld: () => createWorld(),
    pollInputs,
    tick: (w, inp) => tick(w, characters, inp),
    render: (prev, curr, alpha) => {
      const a = prev.players[0];
      const b = curr.players[0];
      const c = prev.players[1];
      const d = curr.players[1];
      if (a && b) p1.update(a, b, alpha);
      if (c && d) p2.update(c, d, alpha);
      healthBars.update(curr);
      matchOverlay.update(curr);
      debugOverlay.update(curr, characters);
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') handle.reset();
    if (e.code === 'F1' || e.code === 'Backquote') {
      e.preventDefault();
      debugOverlay.toggle();
    }
  });
}

void main();
