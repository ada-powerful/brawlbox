import type { Character } from '@/engine/schema.ts';
import type { FighterSpec } from '@/game/mountGame.ts';
import { Match } from '@/game/Match.tsx';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';

/**
 * Runs a live match with the supplied character on BOTH sides. The human drives
 * P1 (proactive: movement, attacks) while P2 stands in as an idle training
 * dummy, so reactions on the *same* fighter (hit reactions, dizzy, knockdown,
 * faint) can be exercised at the same time. null `character` => base-vs-base
 * sparring. A generated character renders procedurally until `atlasUrl` is
 * supplied (post-M2.2 sprite generation), at which point it uses its real atlas.
 */
export function Playtest({
  character,
  atlasUrl,
}: {
  character: Character | null;
  atlasUrl?: string;
}) {
  const char = character ?? BASE_CHARACTER;
  const url = character ? atlasUrl : BASE_ATLAS_URL;

  // Both slots are the player's fighter; only the colour distinguishes them.
  // P1 (pink) is the one the user controls; P2 (blue) just stands and takes it.
  const p1: FighterSpec = { character: char, atlasUrl: url, color: P1_COLOR };
  const p2: FighterSpec = { character: char, atlasUrl: url, color: P2_COLOR };

  // Creator playtest runs in showcase mode: unlimited timer + full health for
  // both fighters, so a new user can freely try out controls without the round
  // ever ending.
  return <Match p1={p1} p2={p2} unlimited />;
}
