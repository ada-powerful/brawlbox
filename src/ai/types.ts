// Shared AI-layer types. This module lives OUTSIDE engine/ — the engine has no
// AI awareness (architectural commitment 3b.5). Nothing here may be imported by
// engine/.
import type { Character } from '../engine/schema.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Provider-agnostic chat call: takes a message list, returns the assistant's
 * raw text. OpenAI/Anthropic/mock all implement this one shape — which is what
 * makes the generator testable without a network.
 */
export type ChatProvider = (messages: ChatMessage[]) => Promise<string>;

/** What the user asks for. A thin spec the LLM turns into a full Character. */
export interface GenSpec {
  /** Free-text description, e.g. "a stone golem brawler with a slow heavy uppercut". */
  prompt: string;
  /** Optional display name override; otherwise the LLM picks one. */
  name?: string;
}

export interface GenerateOptions {
  /** Bounded retry budget for the Zod-feedback loop. Default 3. */
  maxAttempts?: number;
  /** Structural template the LLM adapts (defaults to the base character). */
  template?: unknown;
}

export interface GenerateResult {
  character: Character;
  /** The parsed JSON value that validated. */
  json: unknown;
  /** Raw assistant text of the winning attempt. */
  raw: string;
  /** 1-based attempt count that succeeded. */
  attempts: number;
}
