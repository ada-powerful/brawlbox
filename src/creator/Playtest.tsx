import { useEffect, useRef } from 'react';
import type { Character } from '@/engine/schema.ts';
import { mountGame, type GameHandle } from '@/game/mountGame.ts';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';

/**
 * Runs a live match: base character (P1, with sprites) vs. the supplied
 * character (P2). When `character` is null it's a base-vs-base sparring demo.
 * Generated characters have no atlas yet (M2.2), so they render procedurally.
 */
export function Playtest({ character }: { character: Character | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;

    let handle: GameHandle | null = null;
    let disposed = false;

    // Guarantee P2's id differs from P1 ('base'), else the engine registry collides.
    const opponent: Character = character
      ? character.meta.id === BASE_CHARACTER.meta.id
        ? { ...character, meta: { ...character.meta, id: `${character.meta.id}-opp` } }
        : character
      : BASE_CHARACTER;

    mountGame(mount, {
      p1: { character: BASE_CHARACTER, atlasUrl: BASE_ATLAS_URL, color: P1_COLOR },
      p2: {
        character: opponent,
        atlasUrl: character ? undefined : BASE_ATLAS_URL,
        color: P2_COLOR,
      },
    })
      .then((h) => {
        if (disposed) h.destroy();
        else handle = h;
      })
      .catch((e) => console.error('playtest mount failed', e));

    return () => {
      disposed = true;
      handle?.destroy();
    };
  }, [character]);

  return <div ref={ref} className="overflow-hidden rounded-lg border" />;
}
