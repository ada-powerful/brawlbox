import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// App build/dev config. Test config lives in vitest.config.ts to avoid the
// vite-version type clash between the plugins (vite 6) and vitest's bundled vite.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Expose OPENAI_API_KEY from .env to the client so the key card can be skipped
  // in local dev. This bakes the key into the dev bundle — fine for a personal
  // BYOK dev tool, NOT for a shared/public deploy (use the key card there).
  envPrefix: ['VITE_', 'OPENAI_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Two entries: the creator (index.html) and the backend-free engine
      // sandbox (sandbox.html, served at /sandbox.html).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        sandbox: fileURLToPath(new URL('./sandbox.html', import.meta.url)),
      },
    },
  },
});
