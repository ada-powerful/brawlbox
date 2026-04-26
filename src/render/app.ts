import { Application, Graphics } from 'pixi.js';

export async function startApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: 960,
    height: 540,
    background: '#1a1a1a',
    antialias: false,
  });
  mount.appendChild(app.canvas);

  const rect = new Graphics().rect(380, 230, 200, 80).fill({ color: 0xff5577 });
  app.stage.addChild(rect);

  return app;
}
