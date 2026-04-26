import type { World } from './world.ts';

export function canonicalize(world: World): string {
  return JSON.stringify(world, sortReplacer);
}

function sortReplacer(_key: string, value: unknown): unknown {
  if (value === null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = obj[k];
  }
  return sorted;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(s: string): number {
  let h = FNV_OFFSET >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

export function hashWorld(world: World): number {
  return fnv1a(canonicalize(world));
}
