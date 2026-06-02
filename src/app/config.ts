// Shared backend/auth flags, lifted out of the old monolithic creator so both
// the session layout and the page components agree on the same source of truth.
import { isAuthEnabled } from '@/auth/auth.ts';

// When set, character generation goes through the BrawlBox backend (key lives
// server-side) instead of BYOK. Sprite generation is still BYOK for now.
export const API_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/+$/,
  '',
);
export const BACKEND_MODE = !!API_BASE;

// When auth is configured, backend generation requires a signed-in user.
export const AUTH_ENABLED = isAuthEnabled();

// Per-user cloud storage is available only when signed in to the backend.
export const CAN_CLOUD = BACKEND_MODE && AUTH_ENABLED && !!API_BASE;
