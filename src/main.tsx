import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { Root } from '@/app/Root.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('mount #root missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
