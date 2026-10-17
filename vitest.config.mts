import { defineConfig } from 'vitest/config';
import { readFile } from 'node:fs/promises';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const schema = await readD1Migrations({ migrationsDir: '.', migrationsPattern: 'schema.sql' });
  const frontendTranslations = await readFile('public/js/core/translations.js', 'utf8');
  const [splitTokenMigration] = await readD1Migrations({ migrationsDir: 'migrations', migrationsPattern: 'migrations/2026-14-split-token.sql' });

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: '2026-01-28',
          d1Databases: ['DB'],
          bindings: {
            TEST_SCHEMA: schema,
            SPLIT_TOKEN_MIGRATION: splitTokenMigration.queries,
            FRONTEND_TRANSLATIONS: frontendTranslations,
            TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
            CRON_SECRET: 'cron-test-secret',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  };
});
