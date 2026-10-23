import { serve } from '@hono/node-server'
import { app } from './app.ts'

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => console.log(JSON.stringify({ level: 'info', msg: 'listening', port })))
