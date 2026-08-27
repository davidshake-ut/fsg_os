import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Lets tests import components that use the app's `@/` alias (jsconfig
// paths) and render them with react-dom/server as a runtime smoke check.
// Test discovery stays on vitest's defaults (__tests__/**/*.test.js).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
});
