import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // Unit tests are fast; integration tests require the Firestore emulator.
    // Run them separately via test:unit / test:integration scripts.
    testTimeout: 10000,
    // GCLOUD_PROJECT must be set BEFORE server/lib/firebase.ts is loaded so
    // its initializeApp picks up the right project ID. Harmless for unit
    // tests (they never touch Firestore).
    env: {
      GCLOUD_PROJECT: 'contentai-test',
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@server': path.resolve(import.meta.dirname, 'server'),
    },
    // Allow .js extensions in TypeScript imports (NodeNext convention in source)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
