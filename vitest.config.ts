import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test-only config. Kept separate from vite.config.ts so vitest's bundled vite
// doesn't clash with the app plugins' newer vite types. No plugins needed —
// the engine/AI tests are plain .ts with no JSX or Tailwind.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
