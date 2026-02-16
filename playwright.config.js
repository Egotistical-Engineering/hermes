import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1508, height: 1200 },
  },
  webServer: {
    command: 'npm run web:dev',
    port: 5174,
    reuseExistingServer: true,
  },
});
