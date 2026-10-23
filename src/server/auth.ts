import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, schema } from './db.ts'
import { allowedOrigins } from './core.ts'

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
    : {}

/** What the sign-in page offers. Public. */
export const authConfig = { google: 'google' in google }

export const auth = betterAuth({
  appName: 'PaiseGuru',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Open sign-up. No email verification or reset yet (no mail service): the admin resets with `pnpm user:password`.
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  // Emails are not verified, so a Google sign-in never joins an existing password account: whoever
  // registered that email first could still sign in with their password (account pre-hijacking).
  account: { accountLinking: { disableImplicitLinking: true } },
  // Stricter than the default (3 per 10 s): 5 tries per minute per IP.
  rateLimit: { customRules: { '/sign-in/*': { window: 60, max: 5 }, '/sign-up/*': { window: 60, max: 5 } } },
  socialProviders: google,
  trustedOrigins: allowedOrigins(),
  user: { additionalFields: { upiId: { type: 'string', required: false, input: false } } },
  advanced: {
    database: { generateId: 'uuid' },
    // Vercel sets these from the real client address; used for the rate limit.
    ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for'] },
  },
})

export type SessionUser = typeof auth.$Infer.Session.user
