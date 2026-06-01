import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Sandbox } from './Sandbox.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('mount #root missing');

createRoot(root).render(
  <StrictMode>
    <Sandbox />
  </StrictMode>,
);
