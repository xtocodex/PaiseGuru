import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, NotebookPen } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '../auth.ts'
import { configQuery } from '../queries.ts'
import { Button, ErrorBox, Field, Input, MadeBy } from '../ui.tsx'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
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

function Login() {
  const { redirect } = Route.useSearch()
  const config = useQuery(configQuery())
  const navigate = useNavigate()
  const [error, setError] = useState<Error | null>(null)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const to = safe(redirect)

  async function submit(form: FormData) {
    setError(null)
    setBusy(true)
    const password = String(form.get('password'))
    let res
    if (mode === 'up') {
      res = await authClient.signUp.email({ email: String(form.get('email')), password, name: String(form.get('name')) })
    } else {
      const login = String(form.get('login')).trim()
      res = login.includes('@') ? await authClient.signIn.email({ email: login, password }) : await authClient.signIn.username({ username: login.toLowerCase(), password })
    }
    setBusy(false)
    if (res.error) {
      const msg = res.error.status === 429 ? 'Too many tries. Wait a minute and try again.' : mode === 'in' ? 'Wrong user ID or password.' : (res.error.message ?? 'That did not work.')
      return setError(new Error(msg))
    }
    navigate({ to })
  }

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-6">
      <div className="mt-[12vh]">
        <span className="grid size-16 place-items-center rounded-[20px] bg-brand text-on-brand" aria-hidden>
          <NotebookPen className="size-8" />
        </span>
        <h1 className="mt-5 text-[32px] font-bold tracking-tight text-brand-text">PaiseGuru</h1>
        <p className="mt-2 text-[17px] leading-snug text-muted">Your family's hisaab, settled every month in the fewest UPI payments.</p>
      </div>

      <form action={submit} className="mt-auto flex flex-col gap-4 pt-10">
        {config.data?.google && (
          <Button type="button" variant="secondary" onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: to })}>
            Sign in with Google
          </Button>
        )}
        {mode === 'up' ? (
          <>
            <p className="text-sm font-semibold text-marigold-text">Test account (development only)</p>
            <Field label="Name">
              <Input name="name" required autoComplete="name" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
          </>
        ) : (
          <Field label="User ID">
            <Input name="login" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </Field>
        )}
        <Field label="Password">
          <span className="relative flex items-center">
            <Input name="password" type={show ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} className="pr-12" />
            <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute right-1 grid size-11 place-items-center text-muted">
              {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </span>
        </Field>
        <ErrorBox error={error} />
        <Button type="submit" disabled={busy}>
          {mode === 'up' ? 'Create account' : 'Sign in'}
        </Button>
        {config.data?.devLogin && (
          <Button type="button" variant="ghost" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
            {mode === 'up' ? 'I have an account' : 'Create a test account'}
          </Button>
        )}
        {mode === 'in' && <p className="text-center text-[13px] text-muted">No user ID yet? Ask your Hisaab admin.</p>}
      </form>
      <MadeBy className="py-6" />
    </div>
  )
}
