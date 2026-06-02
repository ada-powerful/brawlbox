import { Navigate } from 'react-router-dom';
import { CAN_CLOUD } from '@/app/config.ts';
import { useSession } from '@/app/session.ts';

// Post-login routing decision, run only on `/`. Signed-in cloud users with at
// least one saved character go straight to the game; brand-new users (or anyone
// with an empty collection) start in the creator. Everyone else — signed out, or
// no backend — just lands on the game and navigates manually. Keeping this on `/`
// alone means it never bounces a user who deliberately clicks "Create".
export function IndexRedirect() {
  const { user, authReady, saved, savedLoaded } = useSession();

  if (!CAN_CLOUD) return <Navigate to="/play" replace />;
  if (!authReady) return <Loading />;
  if (!user) return <Navigate to="/play" replace />;
  if (!savedLoaded) return <Loading />;
  return <Navigate to={saved.length ? '/play' : '/create'} replace />;
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
