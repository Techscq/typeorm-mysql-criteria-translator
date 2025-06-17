import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    globalSetup: ['./vitest.global-setup.ts'],
    reporters: ['default', 'hanging-process'],
    globals: true,
    include: ['src/**/*.{int.test,int.spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', 'coverage'],
      reporter: ['text', 'html'],
    },
  },
});
