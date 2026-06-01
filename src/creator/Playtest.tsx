import { useEffect, useRef } from 'react';
import type { Character } from '@/engine/schema.ts';
import { mountGame, type GameHandle } from '@/game/mountGame.ts';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';

/**
 * Runs a live match between the supplied character and the base character.
 * `side` picks which slot the supplied fighter takes (default P2); the base
 * fills the other. null `character` => base-vs-base sparring. A generated
 * character renders procedurally until `atlasUrl` is supplied (post-M2.2 sprite
 * generation), at which point it uses its real atlas.
 */
export function Playtest({
  character,
  atlasUrl,
  side = 'p2',
}: {
  character: Character | null;
  atlasUrl?: string;
  side?: 'p1' | 'p2';
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;

    let handle: GameHandle | null = null;
    let disposed = false;

    // Guarantee the fighter's id differs from the base ('base'), else the engine
    // registry collides when they share a slot pairing.
    const fighter: Character = character
      ? character.meta.id === BASE_CHARACTER.meta.id
        ? { ...character, meta: { ...character.meta, id: `${character.meta.id}-opp` } }
        : character
      : BASE_CHARACTER;

    const fighterSpec = { character: fighter, atlasUrl: character ? atlasUrl : BASE_ATLAS_URL };
    const baseSpec = { character: BASE_CHARACTER, atlasUrl: BASE_ATLAS_URL };

    // The chosen fighter takes `side`; the base stands in for the other slot.
    // Colors stay tied to the slot so they line up with the control hints.
    const [p1, p2] =
      side === 'p1'
        ? [{ ...fighterSpec, color: P1_COLOR }, { ...baseSpec, color: P2_COLOR }]
        : [{ ...baseSpec, color: P1_COLOR }, { ...fighterSpec, color: P2_COLOR }];

    mountGame(mount, { p1, p2 })
      .then((h) => {
        if (disposed) h.destroy();
        else handle = h;
      })
      .catch((e) => console.error('playtest mount failed', e));

    return () => {
      disposed = true;
      handle?.destroy();
    };
  }, [character, atlasUrl, side]);

  return <div ref={ref} className="overflow-hidden rounded-lg border" />;
}
