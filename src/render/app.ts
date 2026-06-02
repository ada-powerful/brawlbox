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
  // The stage renders at a fixed 960x540; scale the canvas to fill its container
  // width (preserving the 16:9 ratio) so it uses the available space on larger
  // screens instead of sitting left-aligned at intrinsic size. Pixel art stays
  // crisp under the upscale via image-rendering.
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  app.canvas.style.display = 'block';
  app.canvas.style.imageRendering = 'pixelated';

  mount.appendChild(app.canvas);
  return app;
}
