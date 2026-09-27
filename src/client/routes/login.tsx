import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { authClient } from '../auth.ts'
import { configQuery } from '../queries.ts'
import { Button, Card, ErrorBox, Field, Input, MadeBy } from '../ui.tsx'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: Login,
})

// Only same-site paths, so a crafted link can't send people elsewhere after sign-in.
const safe = (path?: string) => (path?.startsWith('/') && !path.startsWith('//') ? path : '/')

function Login() {
  const { redirect } = Route.useSearch()
  const config = useQuery(configQuery())
  const navigate = useNavigate()
  const [error, setError] = useState<Error | null>(null)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const to = safe(redirect)

  async function submit(form: FormData) {
    setError(null)
    const password = String(form.get('password'))
    let res
    if (mode === 'up') {
      res = await authClient.signUp.email({ email: String(form.get('email')), password, name: String(form.get('name')) })
    } else {
      const login = String(form.get('login')).trim()
      res = login.includes('@') ? await authClient.signIn.email({ email: login, password }) : await authClient.signIn.username({ username: login.toLowerCase(), password })
    }
    if (res.error) {
      const msg = res.error.status === 429 ? 'Too many tries. Wait a minute and try again.' : mode === 'in' ? 'Wrong user ID or password.' : (res.error.message ?? 'That did not work.')
      return setError(new Error(msg))
    }
    navigate({ to })
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-3xl font-bold text-brand">PaiseGuru</p>
        <p className="mt-2 text-slate-600">Add shared bills all month. At month-end, divide them once and settle up in the fewest UPI payments.</p>
      </div>
      {config.data?.google && (
        <Button onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: to })}>Sign in with Google</Button>
      )}
      <Card>
        <form action={submit} className="space-y-3">
          {mode === 'up' && <p className="text-sm font-semibold text-amber-800">Test account (development only)</p>}
          {mode === 'up' ? (
            <>
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
            <Input name="password" type="password" required minLength={8} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" className="w-full">
            {mode === 'up' ? 'Create account' : 'Sign in'}
          </Button>
          {config.data?.devLogin && (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
              {mode === 'up' ? 'I have an account' : 'Create a test account'}
            </Button>
          )}
          {mode === 'in' && <p className="text-center text-xs text-slate-500">Don't have a user ID? Ask your Hisaab admin.</p>}
        </form>
      </Card>
      <MadeBy className="mt-4" />
    </div>
  )
}
