import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // Applies WXT's path aliases and provides an in-memory fake `browser` API.
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    mockReset: true,
    restoreMocks: true,
  },
});
