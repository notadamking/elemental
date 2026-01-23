import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include only node-specific test files in tests/node directory
    include: ['tests/node/**/*.test.ts'],
    // Use Node.js environment
    environment: 'node',
    // Timeout for each test
    testTimeout: 10000,
    // Enable globals like describe, it, expect
    globals: true,
  },
});
