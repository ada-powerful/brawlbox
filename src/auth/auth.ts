// Cognito auth via OIDC Authorization Code + PKCE (hosted UI handles both
// native email/password and Google/Facebook). When VITE_COGNITO_* aren't set,
// auth is disabled (isAuthEnabled() === false) and the app stays open.
import { UserManager, type User, WebStorageStateStore } from 'oidc-client-ts';

const AUTHORITY = import.meta.env?.VITE_COGNITO_AUTHORITY as string | undefined;
const CLIENT_ID = import.meta.env?.VITE_COGNITO_CLIENT_ID as string | undefined;
// Hosted UI domain, e.g. brawlbox.auth.us-west-2.amazoncognito.com (for logout).
const COGNITO_DOMAIN = import.meta.env?.VITE_COGNITO_DOMAIN as string | undefined;

const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/` : '';

let manager: UserManager | null = null;

export function isAuthEnabled(): boolean {
  return !!(AUTHORITY && CLIENT_ID);
}

function mgr(): UserManager {
  if (!manager) {
    manager = new UserManager({
      authority: AUTHORITY!,
      client_id: CLIENT_ID!,
      redirect_uri: redirectUri,
      post_logout_redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    });
  }
  return manager;
}

/** If we returned from the hosted UI with a ?code=, complete sign-in and clean the URL. */
export async function handleRedirectCallback(): Promise<User | null> {
  if (!isAuthEnabled()) return null;
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') && params.has('state')) {
    try {
      const user = await mgr().signinRedirectCallback();
      window.history.replaceState({}, '', window.location.pathname);
      return user;
    } catch {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
  return getUser();
}

export async function getUser(): Promise<User | null> {
  if (!isAuthEnabled()) return null;
  const user = await mgr().getUser();
  return user && !user.expired ? user : null;
}

/** Redirect to the hosted UI. Pass 'Google'/'Facebook' to jump straight to that IdP. */
export async function login(idp?: string): Promise<void> {
  await mgr().signinRedirect(idp ? { extraQueryParams: { identity_provider: idp } } : undefined);
}

export async function logout(): Promise<void> {
  await mgr().removeUser();
  if (COGNITO_DOMAIN && CLIENT_ID) {
    const url = `https://${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(redirectUri)}`;
    window.location.assign(url);
  }
}

/** Current access token (for Authorization: Bearer), or null. */
export async function getAccessToken(): Promise<string | null> {
  const user = await getUser();
  return user?.access_token ?? null;
}

export function userEmail(user: User | null): string | undefined {
  return user?.profile?.email;
}
