import { defineConfig, devices } from '@playwright/test';

const PORT = 8799;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bash e2e/start-server.sh',
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { E2E_PORT: String(PORT) },
  },
});
