import { useEffect, useRef } from 'react';
import type { Character } from '@/engine/schema.ts';
import { mountGame, type GameHandle } from '@/game/mountGame.ts';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';

/**
 * Runs a live match: base character (P1, with sprites) vs. the supplied
 * character (P2). null `character` => base-vs-base sparring. A generated
 * character renders procedurally until `atlasUrl` is supplied (post-M2.2 sprite
 * generation), at which point it uses its real atlas.
 */
export function Playtest({
  character,
  atlasUrl,
}: {
  character: Character | null;
  atlasUrl?: string;
}) {
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

    const p2Atlas = character ? atlasUrl : BASE_ATLAS_URL;

    mountGame(mount, {
      p1: { character: BASE_CHARACTER, atlasUrl: BASE_ATLAS_URL, color: P1_COLOR },
      p2: { character: opponent, atlasUrl: p2Atlas, color: P2_COLOR },
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
  }, [character, atlasUrl]);

  return <div ref={ref} className="overflow-hidden rounded-lg border" />;
}
