// Build a ready-to-upload Vercel deployment (Build Output API v3) into .vercel/output:
// static/ = the Vite build, functions/_server.func = the Hono server bundled into one file.
// Deploy with: pnpm deploy:vercel
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { build } from 'esbuild'

const out = '.vercel/output'
rmSync(out, { recursive: true, force: true })
execSync('pnpm build', { stdio: 'inherit' })
cpSync('dist', `${out}/static`, { recursive: true })

const fn = `${out}/functions/_server.func`
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
      // One address only: sign-in cookies are per host, so a Google sign-in started on the vercel.app
      // address would come back to the custom domain (BETTER_AUTH_URL) without its state cookie.
      // The old gopalmohapatra.in host redirects too, so invite and statement links sent before the move still work.
      ...['paiseguru.vercel.app', 'paiseguru.gopalmohapatra.in'].map((host) => ({
        src: '^/(.*)$',
        has: [{ type: 'host', value: host }],
        status: 308,
        headers: { Location: 'https://paiseguru.xtocodex.in/$1' },
      })),
      // The service worker must always be fresh so app updates reach installed phones.
      { src: '^/sw\\.js$', headers: { 'cache-control': 'no-cache' }, continue: true },
      { src: '^/assets/.+$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '^/manifest\\.webmanifest$', headers: { 'content-type': 'application/manifest+json' }, continue: true },
      { src: '^/$', dest: '/index.html' }, // Vercel would otherwise send the root path to the function
      { src: '^/(api/.*|s/.*|health|privacy)$', dest: '/_server' },
      { handle: 'filesystem' },
      { src: '^/assets/.*$', status: 404 },
      { src: '^/.*$', dest: '/index.html' }, // SPA: every other path is the app
    ],
  }),
)
console.log('built', out)
