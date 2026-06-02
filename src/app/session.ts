// Shared session state, provided by SessionLayout via react-router's Outlet
// context and consumed by the Game and Creator pages with useSession().
import { useOutletContext } from 'react-router-dom';
import type { User } from 'oidc-client-ts';
import type { CloudCharacter } from '@/creator/store/cloud.ts';

export interface Session {
  /** Current signed-in user, or null. */
  user: User | null;
  /** True once the hosted-UI redirect callback has resolved (or auth is off). */
  authReady: boolean;
  /** The user's saved characters (empty when signed out / no backend). */
  saved: CloudCharacter[];
  /** True once a saved-character load has completed (or was skipped). */
  savedLoaded: boolean;
  savedError: string | null;
  refreshSaved: () => Promise<void>;
  /** The public gallery (shared by all users). */
  gallery: CloudCharacter[];
  refreshGallery: () => Promise<void>;
}

export function useSession(): Session {
  return useOutletContext<Session>();
}
