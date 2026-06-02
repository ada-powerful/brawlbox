import { useEffect, useRef } from 'react';
import { mountGame, type FighterSpec, type GameHandle } from '@/game/mountGame.ts';

/**
 * Mounts a live match between two fighters into a Pixi canvas. The reusable core
 * shared by the creator's playtest and the game page's roster match-up. A fighter
 * renders procedurally until its `atlasUrl` is supplied (post sprite generation).
 */
export function Match({
  p1,
  p2,
  unlimited = false,
}: {
  p1: FighterSpec;
  p2: FighterSpec;
  /** Showcase mode: never time out and keep both fighters at full health. */
  unlimited?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;

    let handle: GameHandle | null = null;
    let disposed = false;

    // The engine registry is keyed by character id, so two picks that share an
    // id (e.g. base vs base) would collide. Suffix p2 to keep them distinct.
    const p2Spec: FighterSpec =
      p2.character.meta.id === p1.character.meta.id
        ? { ...p2, character: { ...p2.character, meta: { ...p2.character.meta, id: `${p2.character.meta.id}-opp` } } }
        : p2;

    mountGame(mount, { p1, p2: p2Spec, unlimited })
      .then((h) => {
        if (disposed) h.destroy();
        else handle = h;
      })
      .catch((e) => console.error('match mount failed', e));

    return () => {
      disposed = true;
      handle?.destroy();
    };
  }, [p1.character, p1.atlasUrl, p1.color, p2.character, p2.atlasUrl, p2.color, unlimited]);

  return <div ref={ref} className="overflow-hidden rounded-lg border" />;
}
