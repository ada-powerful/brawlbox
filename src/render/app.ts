import { Application } from 'pixi.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../engine/world.ts';

export async function startApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    background: '#1a1a1a',
    antialias: true,
    // The fighters are photorealistic (AI re-skinned), not pixel art, so render
    // the 960x540 stage into a higher-resolution backing buffer and let the GPU
    // downscale it — far crisper than upscaling a 1:1 buffer. Floor at 2 so it's
    // sharp even on 1x displays; honor a higher devicePixelRatio (retina) but cap
    // at 3 to bound the fill cost. autoDensity keeps the CSS box at logical size.
    resolution: Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
    autoDensity: true,
  });
  // The stage renders at a fixed 960x540; scale the canvas to fill its container
  // width (preserving the 16:9 ratio) so it uses the available space on larger
  // screens instead of sitting left-aligned at intrinsic size. Smooth scaling
  // (not 'pixelated') suits the photorealistic sprites.
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  app.canvas.style.display = 'block';
  app.canvas.style.imageRendering = 'auto';

  mount.appendChild(app.canvas);
  return app;
}
