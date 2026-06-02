import type { Character } from '@/engine/schema.ts';
import type { FighterSpec } from '@/game/mountGame.ts';
import { Match } from '@/game/Match.tsx';
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
  const fighter: FighterSpec = {
    character: character ?? BASE_CHARACTER,
    atlasUrl: character ? atlasUrl : BASE_ATLAS_URL,
    color: side === 'p1' ? P1_COLOR : P2_COLOR,
  };
  const base: FighterSpec = {
    character: BASE_CHARACTER,
    atlasUrl: BASE_ATLAS_URL,
    color: side === 'p1' ? P2_COLOR : P1_COLOR,
  };

  // The chosen fighter takes `side`; the base stands in for the other slot.
  const [p1, p2] = side === 'p1' ? [fighter, base] : [base, fighter];

  // Creator playtest runs in showcase mode: unlimited timer + full health for
  // both fighters, so a new user can freely try out controls without the round
  // ever ending.
  return <Match p1={p1} p2={p2} unlimited />;
}
