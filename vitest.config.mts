import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const schema = await readD1Migrations({ migrationsDir: '.', migrationsPattern: 'schema.sql' });

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: '2026-01-28',
          d1Databases: ['DB'],
          bindings: { TEST_SCHEMA: schema },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
    },
  };
});
