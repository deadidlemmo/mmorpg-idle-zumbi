import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:4173';
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.e2e-spec.ts',
  outputDir: path.resolve(__dirname, '../../test-results/browser'),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['line']] : 'list',
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start',
      cwd: path.resolve(__dirname, '../..'),
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_PORT: new URL(apiUrl).port || '3000',
        NODE_ENV: 'test',
        E2E_RATE_LIMIT_DISABLED: 'true',
        FRONTEND_URL: frontendUrl,
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${new URL(frontendUrl).port || '5173'} --strictPort`,
      cwd: path.resolve(__dirname, '../../../frontend'),
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_URL: apiUrl,
        VITE_SOCKET_URL: apiUrl,
        VITE_E2E: 'true',
        VITE_AUTO_COMBAT_PRESENTATION_TIMELINE_V2: 'true',
      },
    },
  ],
});
