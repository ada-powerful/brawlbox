import type { AnimFrame, Character } from './schema.ts';
import type { Player } from './world.ts';

export function setAnimation(player: Player, animId: string): void {
  if (player.animId === animId) return;
  player.animId = animId;
  player.animFrame = 0;
  player.animTime = 0;
}

export function advanceAnimation(player: Player, character: Character): void {
  const anim = character.animations?.[player.animId];
  if (!anim) return;
  const frame = anim.frames[player.animFrame];
  if (!frame) {
    player.animFrame = 0;
    player.animTime = 0;
    return;
  }

  if (frame.duration === -1) {
    player.animTime++;
    return;
  }

  if (player.animTime + 1 >= frame.duration) {
    if (player.animFrame + 1 < anim.frames.length) {
      player.animFrame++;
      player.animTime = 0;
    } else if (anim.loop) {
      player.animFrame = 0;
      player.animTime = 0;
    } else {
      player.animTime = frame.duration - 1;
    }
  } else {
    player.animTime++;
  }
}

export function getActiveFrame(player: Player, character: Character): AnimFrame | undefined {
  return character.animations?.[player.animId]?.frames[player.animFrame];
}
