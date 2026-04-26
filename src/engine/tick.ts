import type { Inputs, World } from './world.ts';
import { Btn, STAGE_LEFT_X, STAGE_RIGHT_X } from './world.ts';

const WALK_SPEED = 3;

export function tick(world: World, inputs: Inputs): World {
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    const inp = inputs.players[i];
    if (!p || !inp) continue;

    let vx = 0;
    if ((inp.buttons & Btn.Left) !== 0) vx -= WALK_SPEED;
    if ((inp.buttons & Btn.Right) !== 0) vx += WALK_SPEED;
    p.vel.x = vx;
    p.vel.y = 0;

    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;

    if (p.pos.x < STAGE_LEFT_X) p.pos.x = STAGE_LEFT_X;
    if (p.pos.x > STAGE_RIGHT_X) p.pos.x = STAGE_RIGHT_X;
    if (p.pos.y < 0) p.pos.y = 0;
  }

  world.tick++;
  return world;
}
