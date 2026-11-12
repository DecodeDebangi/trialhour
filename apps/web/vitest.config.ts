import { defineConfig } from 'vitest/config';

// Vitest bundles its own Vite major, so the Vite React plugin isn't loaded here; JSX is
// compiled with the automatic runtime from tsconfig ("jsx": "react-jsx").
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
