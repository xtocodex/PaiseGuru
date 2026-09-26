import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'

export const app = new Hono()
  .get('/health', (c) => c.json({ ok: true }))
  .use('/*', serveStatic({ root: './dist' }))
  .get('/*', serveStatic({ path: './dist/index.html' }))

export type AppType = typeof app
