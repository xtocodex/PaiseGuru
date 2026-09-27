import { defineConfig } from '@playwright/test'

try {
  process.loadEnvFile() // local runs; CI passes env directly
} catch {}

const port = 3200
const url = `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: url, viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    // Production-like: the built SPA served by Hono, on the disposable test database.
    command: 'node src/server/migrate.ts && pnpm build && node src/server/index.ts',
    url: `${url}/health`,
    timeout: 240_000,
    env: {
      PORT: String(port),
      NODE_ENV: 'test',
      DEV_LOGIN: '1',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      BETTER_AUTH_URL: url,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'e2e-only-secret-not-for-production-use',
    },
  },
})
