// Create a sign-in account (user ID + password) when public sign-up is off (production).
// Usage: pnpm user:create <user-id> "<Full Name>"   → prints a random password once.
import { randomInt } from 'node:crypto'
import { auth, NO_EMAIL_DOMAIN } from './auth.ts'
import { pool } from './db.ts'

// No look-alike characters (0/O, 1/l/I), so it can be read out over the phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const password = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

const [id, name] = process.argv.slice(2)
if (!id || !name || !/^[a-z0-9_.]{3,30}$/.test(id)) {
  console.error('Usage: pnpm user:create <user-id: 3–30 of a-z 0-9 _ .> "<Full Name>"')
  process.exit(1)
}

const ctx = await auth.$context
if (await ctx.internalAdapter.findUserByEmail(`${id}@${NO_EMAIL_DOMAIN}`)) {
  console.error(`User ID "${id}" already exists.`)
  process.exit(1)
}
const pw = password()
const user = await ctx.internalAdapter.createUser(
  { name, email: `${id}@${NO_EMAIL_DOMAIN}`, emailVerified: false, username: id, displayUsername: id },
  { method: 'admin' },
)
await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: await ctx.password.hash(pw) })
console.log(`${name}\tuser ID: ${id}\tpassword: ${pw}`)
await pool.end()
