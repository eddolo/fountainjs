import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}', 'examples/extensions/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
