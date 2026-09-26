import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, schema } from './db.ts'

/**
 * Email + password login exists only so e2e tests can sign in (Google OAuth cannot run in CI).
 * It is on when DEV_LOGIN=1 and NODE_ENV is test or development; the server refuses to boot otherwise.
 */
export function devLoginEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.DEV_LOGIN !== '1') return false
  if (env.NODE_ENV !== 'test' && env.NODE_ENV !== 'development') {
    throw new Error('DEV_LOGIN=1 is only allowed when NODE_ENV is test or development')
  }
  return true
}

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
    : {}

export const auth = betterAuth({
  appName: 'PaiseGuru',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: devLoginEnabled(process.env) },
  socialProviders: google,
  user: { additionalFields: { upiId: { type: 'string', required: false, input: false } } },
  advanced: { database: { generateId: 'uuid' } },
})

export type SessionUser = typeof auth.$Infer.Session.user
