import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['src/**/*.{int.test,int.spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
