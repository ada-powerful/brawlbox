import { createWorld } from './engine/world.ts';
import { tick } from './engine/tick.ts';
import { pollInputs, startKeyboard } from './input/keyboard.ts';
import { startApp } from './render/app.ts';
import { FighterRenderer } from './render/fighter.ts';
import { createStage } from './render/stage.ts';
import { startLoop } from './runtime/loop.ts';

async function main(): Promise<void> {
  const mount = document.getElementById('app');
  if (!mount) throw new Error('mount #app missing');

  const app = await startApp(mount);
  app.stage.addChild(createStage());

  const p1 = new FighterRenderer(0xff5577);
  const p2 = new FighterRenderer(0x55aaff);
  app.stage.addChild(p1.gfx);
  app.stage.addChild(p2.gfx);

  startKeyboard(window);

  startLoop({
    initialWorld: createWorld(),
    pollInputs,
    tick,
    render: (prev, curr, alpha) => {
      const a = prev.players[0];
      const b = curr.players[0];
      const c = prev.players[1];
      const d = curr.players[1];
      if (a && b) p1.update(a, b, alpha);
      if (c && d) p2.update(c, d, alpha);
    },
  });
}

void main();
