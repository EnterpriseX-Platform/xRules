import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }], ['json', { outputFile: 'report/results.json' }]],
  use: {
    baseURL: process.env.XR_BASE || 'http://localhost:4580/xrules/',
    screenshot: 'on',
    storageState: '.auth.json',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    headless: process.env.HEADED ? false : true,
  },
});
