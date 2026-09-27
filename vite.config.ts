import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = `http://localhost:${env.PORT ?? 3000}`
  return {
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/client/routes',
      generatedRouteTree: './src/client/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  build: { outDir: 'dist' },
  server: { port: Number(env.DEV_PORT ?? 5173), strictPort: true, proxy: { '/api': api, '/s/': api, '/health': api } },
  test: {
    include: ['src/**/*.test.ts'],
    // Tests run against the disposable test database only (tests/setup.ts truncates it).
    env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL ?? '', NODE_ENV: 'test', DEV_LOGIN: '1', BETTER_AUTH_URL: 'http://localhost:3000' },
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false, // integration tests share one test database
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  }
})
