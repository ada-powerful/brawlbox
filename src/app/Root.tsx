import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionLayout } from '@/app/SessionLayout.tsx';
import { IndexRedirect } from '@/app/IndexRedirect.tsx';
import { GamePage } from '@/game/GamePage.tsx';
import { CreatorPage } from '@/creator/CreatorPage.tsx';

// Route table. Every page renders inside SessionLayout so they share one auth
// session + saved-character list. `/` decides where to send the user.
export function Root() {
  return (
    <Routes>
      <Route element={<SessionLayout />}>
        <Route index element={<IndexRedirect />} />
        <Route path="play" element={<GamePage />} />
        <Route path="create" element={<CreatorPage />} />
        <Route path="*" element={<Navigate to="/play" replace />} />
      </Route>
    </Routes>
  );
}
