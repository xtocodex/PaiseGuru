import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, MailCheck, NotebookPen } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '../auth.ts'
import { configQuery } from '../queries.ts'
import { Button, ErrorBox, Field, Input } from '../ui.tsx'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional(), error: z.string().optional(), reset: z.string().optional() }),
  component: Login,
})

// Only same-site paths, so a crafted link can't send people elsewhere after sign-in.
const safe = (path?: string) => {
  try {
    const u = new URL(path ?? '/', window.location.origin)
    return u.origin === window.location.origin ? `${u.pathname}${u.search}` : '/'
  } catch {
    return '/'
  }
}

// Google's own "G" (their branding rules ask for it on the sign-in button).
const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

// Google joins an existing account only once its email is confirmed (see server auth.ts).
const OAUTH_ERROR: Record<string, string> = {
  account_not_linked: 'This email has an account that is not confirmed yet. Open the link we emailed you, or sign in with your password.',
}

function Login() {
  const { redirect, error: oauthError, reset } = Route.useSearch()
  const config = useQuery(configQuery())
  const navigate = useNavigate()
  const [error, setError] = useState<Error | null>(oauthError ? new Error(OAUTH_ERROR[oauthError] ?? 'Google sign-in did not work. Try again.') : null)
  const [notice, setNotice] = useState<string | null>(reset ? 'Password changed. Sign in with your new password.' : null)
  const [sentTo, setSentTo] = useState<string | null>(null) // sign-up done: waiting for the emailed link
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const to = safe(redirect)

  const switchTo = (m: typeof mode) => (setMode(m), setError(null), setNotice(null))

  async function submit(form: FormData) {
    setError(null)
    setNotice(null)
    setBusy(true)
    const email = String(form.get('email')).trim().toLowerCase()
    const password = String(form.get('password'))
    // The emailed link brings people back to where they were going (callbackURL).
    const res =
      mode === 'forgot'
        ? await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
        : mode === 'up'
          ? await authClient.signUp.email({ email, password, name: String(form.get('name')).trim(), callbackURL: to })
          : await authClient.signIn.email({ email, password, callbackURL: to })
    setBusy(false)
    if (res.error) {
      if (res.error.code === 'EMAIL_NOT_VERIFIED') return setNotice(`Confirm your email first. We sent a new link to ${email}.`)
      const msg =
        res.error.status === 429
          ? 'Too many tries. Wait a minute and try again.'
          : mode === 'in'
            ? 'Wrong email or password.'
            : (res.error.message ?? 'That did not work.')
      return setError(new Error(msg))
    }
    if (mode === 'forgot') return setNotice(`If ${email} has a PaiseGuru account, we sent it a link to choose a new password. Check spam too.`)
    if (mode === 'up') return setSentTo(email)
    navigate({ to })
  }

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-6">
      <div className="mt-[10vh]">
        <span className="grid size-16 place-items-center rounded-[20px] bg-brand text-on-brand" aria-hidden>
          <NotebookPen className="size-8" />
        </span>
        <h1 className="mt-5 text-hero font-bold tracking-tight text-brand-text">PaiseGuru</h1>
        <p className="mt-2 text-title leading-snug text-muted">Split bills with friends, flatmates, trips and family. Settle in the fewest UPI payments.</p>
      </div>

      {sentTo ? (
        <div className="mt-auto flex flex-col gap-4 pt-10" role="status">
          <span className="grid size-14 place-items-center rounded-full bg-gets-soft text-gets" aria-hidden>
            <MailCheck className="size-7" />
          </span>
          <h2 className="text-page font-bold tracking-tight">Check your email</h2>
          <p className="text-body leading-snug text-muted">
            We sent a link to <span className="font-semibold text-text">{sentTo}</span>. Open it on this phone to finish creating your account. It can take a minute; check spam too.
          </p>
          <Button variant="secondary" onClick={() => (setSentTo(null), switchTo('in'))}>
            Back to sign in
          </Button>
        </div>
      ) : (
      <form action={submit} className="mt-auto flex flex-col gap-4 pt-10">
        {config.data?.google && (
          <>
            <Button type="button" variant="secondary" onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: to, errorCallbackURL: '/login' })}>
              <GoogleG />
              Continue with Google
            </Button>
            <p className="text-center text-caption text-faint">or with email</p>
          </>
        )}
        {mode === 'up' && (
          <Field label="Your name">
            <Input name="name" required autoComplete="name" maxLength={60} />
          </Field>
        )}
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        {mode !== 'forgot' && (
          <Field label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}>
            <span className="relative flex items-center">
              <Input name="password" type={show ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} className="pr-12" />
              <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute right-1 grid size-11 place-items-center text-muted">
                {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
              </button>
            </span>
          </Field>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-gets-soft p-3 text-body text-gets">
            {notice}
          </p>
        )}
        <ErrorBox error={error} />
        <Button type="submit" disabled={busy}>
          {mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </Button>
        {mode === 'in' && (
          <Button type="button" variant="ghost" onClick={() => switchTo('forgot')}>
            Forgot password?
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => switchTo(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'New here? Create an account' : 'Back to sign in'}
        </Button>
      </form>
      )}
      <p className="py-6 text-center text-caption text-faint">
        Free. No limits on how many expenses you add. ·{' '}
        <a href="/privacy" className="-my-3 inline-block py-3 underline underline-offset-2">
          Privacy
        </a>
      </p>
    </div>
  )
}
