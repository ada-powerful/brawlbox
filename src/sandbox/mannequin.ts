// Original wooden-mannequin demo character ("Strong Bajiquan"), generated via the
// creator (kfm2lite gameplay re-skinned by NB2). Replaces the former KFM demo.
import { parseCharacter, type Character } from '@/engine/schema.ts';
import mannequinData from './mannequin.json' with { type: 'json' };
import mannequinAtlasUrl from './mannequin-atlas.png';

export const MANNEQUIN_ATLAS_URL: string = mannequinAtlasUrl;
export const MANNEQUIN_CHARACTER: Character = parseCharacter(mannequinData as unknown);
