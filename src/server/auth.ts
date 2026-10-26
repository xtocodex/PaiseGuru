import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { and, eq } from 'drizzle-orm'
import { account, db, schema, user as userTable } from './db.ts'
import { allowedOrigins, appUrl, claimInvites } from './core.ts'
import { message, notify, sendMail } from './mail.ts'

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'
const list = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** Once, after the first verified sign-in (email link or Google sign-up). Names groups an invite already joined. */
async function welcome(user: { id: string; name: string; email: string }) {
  const joined = await claimInvites(user)
  await notify(
    message({
      to: user.email,
      subject: `Welcome to PaiseGuru, ${firstName(user.name)}`,
      heading: `Welcome, ${firstName(user.name)}`,
      preheader: 'Three small things that make PaiseGuru work for you.',
      lines: [
        'PaiseGuru keeps shared money simple: add bills as they happen, and settle up in the fewest UPI payments.',
        ...(joined.length ? [`You're already in ${list(joined)}. Your share is waiting there.`] : []),
      ],
      steps: [
        { title: 'Add your UPI ID', text: 'Open Me and add it, so friends can pay you with one tap.' },
        { title: 'Put PaiseGuru on your home screen', text: 'It opens like an app. In your browser menu, choose Add to Home Screen.' },
        joined.length
          ? { title: 'Add your first expense', text: "Open your group and add a bill; everyone's share updates at once." }
          : { title: 'Start a group', text: 'For a flat, a trip or family. Invite people by email; they join with their name already there.' },
      ],
      button: joined.length ? 'Open PaiseGuru' : 'Start a group',
      url: joined.length ? appUrl() : `${appUrl()}/groups/new`,
      footer: "You're getting this because you just created a PaiseGuru account.",
    }),
  )
}

const passwordChanged = (u: { email: string }) =>
  notify(
    message({
      to: u.email,
      subject: 'Your PaiseGuru password was changed',
      heading: 'Your password was changed',
      lines: [`The password for your PaiseGuru account (${u.email}) was just changed. If that was you, you're all set.`],
      button: "This wasn't me: reset password",
      url: `${appUrl()}/login`,
      footer: "If you didn't change it, reset your password now and reply to this email so we can help.",
    }),
  )

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
      sendMail(message({ to: user.email, subject: 'Reset your PaiseGuru password', heading: 'Choose a new password', lines: ['Someone asked to reset the password for your PaiseGuru account. The link works for 1 hour.'], button: 'Choose a new password', url })),
    onPasswordReset: ({ user }) => passwordChanged(user),
    // Sign-up answers the same for a taken email (no account guessing), so tell the owner here instead.
    onExistingUserSignUp: ({ user }) =>
      sendMail(message({ to: user.email, subject: 'You already have a PaiseGuru account', heading: 'You already have an account', lines: ['Someone tried to create a PaiseGuru account with this email, but you already have one.', 'Sign in, or reset your password if you forgot it.'], button: 'Sign in', url: `${appUrl()}/login` })),
  },
  emailVerification: {
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) =>
      sendMail(message({ to: user.email, subject: 'Confirm your email for PaiseGuru', heading: `Hi ${firstName(user.name)}, confirm your email`, lines: ['Confirm this is your email to start using PaiseGuru. The link works for 1 hour.'], button: 'Confirm email', url })),
    // First confirmation: groups that invited this email take the person in, then the welcome mail.
    afterEmailVerification: (user) => welcome(user),
  },
  databaseHooks: {
    user: {
      create: {
        // A Google sign-up arrives already verified. Runs after the user row is committed.
        after: async (user) => {
          if (user.emailVerified) await welcome(user)
        },
      },
    },
    account: {
      create: {
        // Google linked into an existing password account: tell the owner (a new Google sign-up has none).
        after: async (acc) => {
          if (acc.providerId !== 'google') return
          const [hasPassword] = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, acc.userId), eq(account.providerId, 'credential')))
          const [u] = await db.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, acc.userId))
          if (!hasPassword || !u) return
          await notify(
            message({
              to: u.email,
              subject: 'Google sign-in was added to your PaiseGuru account',
              heading: 'Google sign-in added',
              lines: [`You can now sign in to PaiseGuru with Google as ${u.email}, as well as with your password.`],
              button: "This wasn't me: reset password",
              url: `${appUrl()}/login`,
              footer: "If this wasn't you, reset your password right away and reply to this email.",
            }),
          )
        },
      },
    },
  },
  hooks: {
    // Changing the password in Me (a reset is covered by onPasswordReset).
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/change-password' || ctx.context.returned instanceof APIError) return
      const u = ctx.context.session?.user
      if (u) await passwordChanged(u)
    }),
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
