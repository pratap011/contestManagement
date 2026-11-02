import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-secret-value-that-is-long-enough',
      PGLITE_DATA_DIR: '.data/test-pglite',
      AERODATABOX_API_KEY: 'test-aerodatabox-key',
      VAPID_KEYS_FILE: '.data/test-vapid.json',
    },
  },
})
