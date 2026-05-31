// Pure prompt construction + response parsing helpers for character generation.
// No network, no DOM — unit-testable in isolation.
import { ZodError } from 'zod';
import type { GenSpec } from './types.ts';

/**
 * Teach the model the Character JSON format and pin it to the base character as
 * a structural template. The model customizes stats/attacks/behavior while
 * reusing base state + animation ids, so the engine's existing mechanics and
 * procedural renderer keep working (real sprites land in M2.2).
 */
export function buildSystemPrompt(template: unknown): string {
  return `You are a fighting-game character designer for the "BrawlBox" engine. You output ONE JSON object describing a complete, playable character. Output ONLY JSON — no prose, no markdown fences.

The engine is MUGEN-like. Key rules you MUST follow:

- State ids and animation ids are STRINGS (e.g. "stand", "walk", "jump.rise", "hit.stand", "ko", "punch"). Reuse the base character's state and animation ids exactly — the engine's base mechanics and renderer depend on them. You MAY add new attack states (and matching animations + commands).
- Triggers are a JSON AST, never a string expression. Shapes:
  - { "op": "and"|"or", "args": [Trigger, ...] }
  - { "op": "not", "arg": Trigger }
  - { "op": "eq"|"ne"|"lt"|"le"|"gt"|"ge", "left": Value, "right": Value }
  - { "op": "flag", "name": "ctrl"|"moveContact"|"moveHit"|"moveGuarded" }
  - { "op": "button", "held": "up"|"down"|"left"|"right"|"a"|"b"|"c"|"x"|"y"|"z" }
  - { "op": "command", "name": "<a command you declared in commands[]>" }
  where Value is { "const": number|string|boolean } or { "ref": "time"|"animTime"|"animElem"|"stateNo"|"vel.x"|"vel.y"|"pos.x"|"pos.y"|"life" }.
- Controllers (in state.controllers[]) are discriminated by "type": "ChangeState" (value = state id), "ChangeAnim" (value = anim id), "VelSet" {x?,y?}, "VelAdd" {x?,y?}, "CtrlSet" {value:0|1}, "HitDef" {def}. Each has a "trigger".
- HitDef.groundVelocity.x convention: POSITIVE = knock the victim away in the attacker's facing direction.
- EVERY ChangeState.value and ChangeAnim.value MUST reference a state/animation that exists in your output. EVERY {op:"command"} name MUST be declared in commands[]. Unresolved references are rejected.
- Do NOT include a "spriteAtlas" field — sprites are generated in a later step. The character must still be valid without it.

Validation constraints: data.life > 0, 0 <= data.groundFriction <= 1, data.gravity >= 0, size.width/height > 0. state.type is "S"|"C"|"A"|"L", moveType "A"|"I"|"H", physics "S"|"C"|"A"|"N".

Use this BASE character as your template. Keep its structure; adapt meta, data (stats), size, and add/modify attack states, animations, and commands to match the user's request:

${JSON.stringify(template, null, 2)}`;
}

export function buildUserPrompt(spec: GenSpec): string {
  const nameLine = spec.name ? `\nUse the name "${spec.name}".` : '';
  return `Design a character: ${spec.prompt}${nameLine}\n\nReturn the full Character JSON object.`;
}

/** Feedback message appended after a failed attempt so the model can self-correct. */
export function buildRetryMessage(errorText: string): string {
  return `That JSON was invalid. Fix these problems and return the COMPLETE corrected Character JSON (JSON only, no prose):\n\n${errorText}`;
}

/**
 * Pull a JSON object out of an assistant response. Tolerates markdown fences and
 * leading/trailing prose by extracting the outermost { ... }. Throws on failure
 * (the caller turns that into retry feedback).
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  // Prefer the first balanced-looking object span if there's surrounding prose.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const slice = start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    return JSON.parse(slice);
  } catch (e) {
    throw new Error(`Response was not valid JSON: ${(e as Error).message}`);
  }
}

/** Turn a parseCharacter failure (ZodError or reference Error) into model-readable feedback. */
export function formatParseError(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues
      .map((i) => `- ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
      .join('\n');
  }
  if (err instanceof Error) return `- ${err.message}`;
  return `- ${String(err)}`;
}
