import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // node environment: Node 18+ provides ReadableStream, TextDecoder, AbortController
    // natively — no jsdom install required for these tests. jsdom is declared as a
    // devDep for future browser-specific tests; switch environment below to use it.
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
});
