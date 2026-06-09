import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { User } from 'oidc-client-ts';
import { Button } from '@/components/ui/button.tsx';
import { handleRedirectCallback, getAccessToken, login, logout, userEmail } from '@/auth/auth.ts';
import { listCloudCharacters, listGallery, type CloudCharacter } from '@/creator/store/cloud.ts';
import { listLocalCharacters } from '@/creator/store/local.ts';
import { API_BASE, AUTH_ENABLED, BACKEND_MODE, CAN_CLOUD } from '@/app/config.ts';
import type { Session } from '@/app/session.ts';

// Persistent shell shared by every route: owns the auth session + the user's
// saved characters and public gallery (one source of truth, fetched once), draws
// the header nav, and hands the session to the active page via Outlet context.
export function SessionLayout() {
  const [user, setUser] = useState<User | null>(null);
  // Auth is "ready" immediately when disabled; otherwise after the redirect
  // callback resolves. IndexRedirect waits on this before deciding where to go.
  const [authReady, setAuthReady] = useState(!AUTH_ENABLED);
  const [saved, setSaved] = useState<CloudCharacter[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<CloudCharacter[]>([]);

  // Complete any hosted-UI redirect (?code=) and load the current session.
  useEffect(() => {
    if (!AUTH_ENABLED) return;
    void handleRedirectCallback().then((u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  const refreshSaved = async (): Promise<void> => {
    if (!BACKEND_MODE) {
      // Local BYOK mode: characters persist in IndexedDB (no backend/auth).
      try {
        setSaved(await listLocalCharacters());
        setSavedError(null);
      } catch (e) {
        setSavedError(`Couldn't load your local characters (${(e as Error).message}).`);
      } finally {
        setSavedLoaded(true);
      }
      return;
    }
    if (!CAN_CLOUD || !user || !API_BASE) {
      setSavedLoaded(true);
      return;
    }
    try {
      const token = await getAccessToken();
      if (token) {
        setSaved(await listCloudCharacters(API_BASE, token));
        setSavedError(null);
      }
    } catch (e) {
      // Surface the failure: an empty list and a load error look identical to
      // the user otherwise, hiding real backend/auth problems.
      setSavedError(`Couldn't load your saved characters (${(e as Error).message}).`);
    } finally {
      setSavedLoaded(true);
    }
  };

  // Reload the user's saved characters whenever the session changes.
  useEffect(() => {
    setSavedLoaded(false);
    void refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refreshGallery = async (): Promise<void> => {
    if (!BACKEND_MODE || !API_BASE) return;
    try {
      setGallery(await listGallery(API_BASE)); // public — no token needed
    } catch {
      /* non-fatal */
    }
  };

  // Load the public gallery once on mount.
  useEffect(() => {
    void refreshGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const session: Session = {
    user,
    authReady,
    saved,
    savedLoaded,
    savedError,
    refreshSaved,
    gallery,
    refreshGallery,
  };

  const navClass = ({ isActive }: { isActive: boolean }): string =>
    `text-sm font-medium transition-colors hover:text-primary ${
      isActive ? 'text-primary' : 'text-muted-foreground'
    }`;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-6">
          <h1 className="text-xl font-semibold tracking-tight">BrawlBox</h1>
          <nav className="flex items-center gap-4">
            <NavLink to="/play" className={navClass}>
              Play
            </NavLink>
            <NavLink to="/create" className={navClass}>
              Create
            </NavLink>
          </nav>
        </div>
        {AUTH_ENABLED && (
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{userEmail(user)}</span>
                <Button variant="secondary" size="sm" onClick={() => void logout()}>
                  Sign out
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => void login()}>
                Sign in
              </Button>
            )}
          </div>
        )}
      </header>

      <Outlet context={session} />
    </div>
  );
}
