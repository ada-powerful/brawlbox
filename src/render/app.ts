import { Application } from 'pixi.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../engine/world.ts';

export async function startApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    background: '#1a1a1a',
    antialias: false,
  });
  mount.appendChild(app.canvas);
  return app;
}
