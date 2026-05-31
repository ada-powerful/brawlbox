import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from '@/creator/App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('mount #root missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
