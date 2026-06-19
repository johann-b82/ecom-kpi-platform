import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // DB integration tests share one Postgres instance; run files serially so they don't race.
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'], fileParallelism: false },
});
