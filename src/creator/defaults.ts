// The built-in sparring partner: the hand-authored base character + its atlas.
// Used as P1 in the playtest and as the opponent for generated characters.
import baseChar from '../../characters/base/character.json' with { type: 'json' };
import baseAtlasUrl from '../../characters/base/atlas.png';
import { parseCharacter, type Character } from '../engine/schema.ts';

export const BASE_CHARACTER: Character = parseCharacter(baseChar);
export const BASE_ATLAS_URL: string = baseAtlasUrl;

export const P1_COLOR = 0xff5577;
export const P2_COLOR = 0x55aaff;
