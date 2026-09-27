import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins/username'
import { db, schema } from './db.ts'
import { allowedOrigins } from './core.ts'

/**
 * Open sign-up (test accounts) exists only for local testing and e2e (Google OAuth cannot run in CI).
 * It is on when DEV_LOGIN=1 and NODE_ENV is test or development; the server refuses to boot otherwise.
 * Signing in with a user ID and password works everywhere (founder, 2026-09-27: family accounts until Google);
 * in production those accounts are created only by `pnpm user:create`.
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

/** What the sign-in page offers. Public. */
export const authConfig = { devLogin: devLoginEnabled(process.env), google: 'google' in google }

/** Accounts made without an email get this placeholder domain; it is never shown or mailed. */
export const NO_EMAIL_DOMAIN = 'no-email.paiseguru.local'

export const auth = betterAuth({
  appName: 'PaiseGuru',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, disableSignUp: !authConfig.devLogin, minPasswordLength: 8 },
  plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 })],
  // Stricter than the default (3 per 10 s): 5 sign-in tries per minute per IP.
  rateLimit: { customRules: { '/sign-in/*': { window: 60, max: 5 } } },
  socialProviders: google,
  trustedOrigins: allowedOrigins(),
  user: { additionalFields: { upiId: { type: 'string', required: false, input: false } } },
  advanced: {
    database: { generateId: 'uuid' },
    // Vercel sets these from the real client address; used for the sign-in rate limit.
    ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for'] },
  },
})

export type SessionUser = typeof auth.$Infer.Session.user
