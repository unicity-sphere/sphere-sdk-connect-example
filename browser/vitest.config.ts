import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Required so @testing-library/react can register its automatic cleanup() on the
    // global afterEach — without it, mounted components leak between tests.
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Every vi.spyOn (window.open, …) is undone between tests.
    restoreMocks: true,
  },
});
