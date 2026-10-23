// Set a new password for an existing account (no forgot-password flow yet). Usage: pnpm user:password <email> <new-password>
import { eq, and } from 'drizzle-orm'
import { auth } from './auth.ts'
import { account, db, pool, user } from './db.ts'

const [id, pw] = process.argv.slice(2)
if (!id || !pw || pw.length < 8) {
  console.error('Usage: pnpm user:password <email> <new-password (8+ characters)>')
  process.exit(1)
}
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, id.toLowerCase()))
if (!u) {
  console.error(`No user with email "${id}".`)
  process.exit(1)
}
const ctx = await auth.$context
const rows = await db
  .update(account)
  .set({ password: await ctx.password.hash(pw) })
  .where(and(eq(account.userId, u.id), eq(account.providerId, 'credential')))
  .returning({ id: account.id })
console.log(rows.length ? `Password changed for ${id}.` : `${id} has no password sign-in.`)
await pool.end()
