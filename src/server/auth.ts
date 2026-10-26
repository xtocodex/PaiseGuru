import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, schema } from './db.ts'
import { allowedOrigins, appUrl, claimInvites } from './core.ts'
import { message, sendMail } from './mail.ts'

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
    : {}

/** What the sign-in page offers. Public. */
export const authConfig = { google: 'google' in google }

export const auth = betterAuth({
  appName: 'PaiseGuru',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Open sign-up; a password account can sign in only after clicking the link mailed to it.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) =>
      sendMail(message({ to: user.email, subject: 'Reset your PaiseGuru password', lines: ['Someone asked to reset the password for your PaiseGuru account.', 'The link works for 1 hour.'], button: 'Choose a new password', url })),
    // Sign-up answers the same for a taken email (no account guessing), so tell the owner here instead.
    onExistingUserSignUp: ({ user }) =>
      sendMail(message({ to: user.email, subject: 'You already have a PaiseGuru account', lines: ['Someone tried to create a PaiseGuru account with this email, but you already have one.', 'Sign in, or reset your password if you forgot it.'], button: 'Sign in', url: `${appUrl()}/login` })),
  },
  emailVerification: {
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) =>
      sendMail(message({ to: user.email, subject: 'Confirm your email for PaiseGuru', lines: [`Hi ${user.name},`, 'Confirm this is your email to start using PaiseGuru. The link works for 1 hour.'], button: 'Confirm email', url })),
    // Groups that invited this email take the person in now.
    afterEmailVerification: (user) => claimInvites(user),
  },
  databaseHooks: {
    user: {
      create: {
        // A Google sign-up arrives already verified. Runs after the user row is committed.
        after: async (user) => {
          if (user.emailVerified) await claimInvites(user)
        },
      },
    },
  },
  // Every email is verified now (Google's, or by the link above), so a Google sign-in joins the
  // existing account with the same email. better-auth links only into verified accounts.
  // Stricter than the default (3 per 10 s): 5 tries per minute per IP; mail-sending routes 3.
  rateLimit: {
    customRules: {
      '/sign-in/*': { window: 60, max: 5 },
      '/sign-up/*': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
      '/send-verification-email': { window: 60, max: 3 },
    },
  },
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
