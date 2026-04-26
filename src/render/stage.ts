import { Graphics } from 'pixi.js';
import { GROUND_Y_SCREEN, STAGE_LEFT_X, STAGE_RIGHT_X, STAGE_WIDTH } from '../engine/world.ts';

export function createStage(): Graphics {
  const g = new Graphics();
  g.rect(0, GROUND_Y_SCREEN, STAGE_WIDTH, 80).fill({ color: 0x222222 });
  g.rect(STAGE_LEFT_X - 2, GROUND_Y_SCREEN - 8, 4, 8).fill({ color: 0x555555 });
  g.rect(STAGE_RIGHT_X - 2, GROUND_Y_SCREEN - 8, 4, 8).fill({ color: 0x555555 });
  return g;
}
