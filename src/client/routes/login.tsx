import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, NotebookPen } from 'lucide-react'
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
    if (mode === 'up') return setNotice(`We sent a link to ${email}. Open it to finish creating your account. Check spam too.`)
    navigate({ to })
  }

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-6">
      <div className="mt-[10vh]">
        <span className="grid size-16 place-items-center rounded-[20px] bg-brand text-on-brand" aria-hidden>
          <NotebookPen className="size-8" />
        </span>
        <h1 className="mt-5 text-[32px] font-bold tracking-tight text-brand-text">PaiseGuru</h1>
        <p className="mt-2 text-[17px] leading-snug text-muted">Split bills with friends, flatmates, trips and family. Settle in the fewest UPI payments.</p>
      </div>

      <form action={submit} className="mt-auto flex flex-col gap-4 pt-10">
        {config.data?.google && (
          <>
            <Button type="button" variant="secondary" onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: to, errorCallbackURL: '/login' })}>
              Continue with Google
            </Button>
            <p className="text-center text-[13px] text-faint">or with email</p>
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
          <p role="status" className="rounded-xl bg-gets-soft p-3 text-sm text-gets">
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
      <p className="py-6 text-center text-xs text-faint">
        Free. No limits on how many expenses you add. ·{' '}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy
        </a>
      </p>
    </div>
  )
}
