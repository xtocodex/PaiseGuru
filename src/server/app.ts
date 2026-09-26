import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { requestId } from 'hono/request-id'
import { serveStatic } from '@hono/node-server/serve-static'
import { sql } from 'drizzle-orm'
import { auth } from './auth.ts'
import { AppError, appUrl, db, notFound, type Env } from './core.ts'
import { hisaabRoutes } from './routes/hisaab.ts'
import { meRoutes } from './routes/me.ts'
import { publicRoutes } from './routes/public.ts'
import { sheetRoutes } from './routes/sheet.ts'

const api = new Hono<Env>()
  .use(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) throw new AppError(401, 'signed_out', 'Please sign in.')
    c.set('user', session.user)
    await next()
  })
  .route('/', hisaabRoutes)
  .route('/', sheetRoutes)
  .route('/', meRoutes)

const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ time: new Date().toISOString(), ...fields }))

// Connection-level failures from pg / Node: the database is unreachable, not a bug in our code.
const DB_DOWN = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P03', '53300'])

export const app = new Hono<Env>()
  .use(requestId())
  .use(async (c, next) => {
    const start = performance.now()
    await next()
    // Never log bodies: notes and names stay out of logs.
    if (process.env.NODE_ENV !== 'test') log({ level: 'info', requestId: c.var.requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start), userId: c.var.user?.id })
  })
  .get('/health', async (c) => {
    try {
      await db.execute(sql`select 1`)
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false }, 503)
    }
  })
  .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .use('/api/*', csrf({ origin: new URL(appUrl()).origin }))
  .route('/api', api)
  .all('/api/*', () => {
    throw notFound()
  })
  .route('/', publicRoutes)
  .use('/*', serveStatic({ root: './dist' }))
  .get('/*', serveStatic({ path: './dist/index.html' }))

app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.code, message: err.message }, err.status)
  const code = (err as { code?: string }).code
  if (code && DB_DOWN.has(code)) {
    log({ level: 'error', requestId: c.var.requestId, msg: 'database unavailable', code })
    return c.json({ error: 'db_unavailable', message: 'Something went wrong, try again.' }, 503)
  }
  // gstack-shortcut(dec-ef00621d): browser errors not reported, upgrade before non-family users
  log({ level: 'error', requestId: c.var.requestId, path: c.req.path, msg: err.message, stack: err.stack })
  return c.json({ error: 'internal', message: 'Something went wrong.', requestId: c.var.requestId }, 500)
})

export type AppType = typeof app
