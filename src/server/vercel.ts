// Vercel entry: the same Hono app, as a Node (req, res) handler. Static files are served by Vercel's CDN.
import { getRequestListener } from '@hono/node-server'
import { app } from './app.ts'

export default getRequestListener(app.fetch)
