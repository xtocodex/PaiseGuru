// Build a ready-to-upload Vercel deployment (Build Output API v3) into .vercel/output:
// static/ = the Vite build, functions/index.func = the Hono server bundled into one file.
// Deploy with: pnpm deploy:vercel
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { build } from 'esbuild'

const out = '.vercel/output'
rmSync(out, { recursive: true, force: true })
execSync('pnpm build', { stdio: 'inherit' })
cpSync('dist', `${out}/static`, { recursive: true })

const fn = `${out}/functions/index.func`
mkdirSync(fn, { recursive: true })
await build({
  entryPoints: ['src/server/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['pg-native'],
  // Bundled CommonJS dependencies still call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
})
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true, regions: ['sin1'], maxDuration: 30 }),
)
writeFileSync(
  `${out}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { src: '^/(api/.*|s/.*|health)$', dest: '/index' },
      { handle: 'filesystem' },
      { src: '^/assets/.*$', status: 404 },
      { src: '^/.*$', dest: '/index.html' }, // SPA: every other path is the app
    ],
  }),
)
console.log('built', out)
