import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const api = 'http://localhost:3000'

export default defineConfig(({ mode }) => ({
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
  server: { proxy: { '/api': api, '/s/': api, '/health': api } },
  test: {
    include: ['src/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    fileParallelism: false, // integration tests share one test database
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}))
