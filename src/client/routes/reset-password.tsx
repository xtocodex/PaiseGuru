import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '../auth.ts'
import { Button, ButtonLink, ErrorBox, Field, Input } from '../ui.tsx'

// The emailed link lands here with ?token=… (or ?error=INVALID_TOKEN when it expired or was used).
export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: ResetPassword,
})

function ResetPassword() {
  const { token, error: linkError } = Route.useSearch()
  const navigate = useNavigate()
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(form: FormData) {
    setError(null)
    setBusy(true)
    const res = await authClient.resetPassword({ newPassword: String(form.get('password')), token: token! })
    setBusy(false)
    if (res.error) return setError(new Error(res.error.code === 'INVALID_TOKEN' ? 'This link has expired or was already used. Ask for a new one.' : (res.error.message ?? 'That did not work.')))
    navigate({ to: '/login', search: { reset: 'done' }, replace: true })
  }

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col gap-4 px-6">
      <h1 className="mt-[10vh] text-[28px] font-bold tracking-tight text-brand-text">Choose a new password</h1>
      {!token || linkError ? (
        <>
          <ErrorBox error={new Error('This link has expired or was already used. Ask for a new one from the sign-in page.')} />
          <ButtonLink to="/login">Back to sign in</ButtonLink>
        </>
      ) : (
        <form action={submit} className="flex flex-col gap-4">
          <p className="text-[15px] text-muted">You will be signed out on your other devices.</p>
          <Field label="New password" hint="At least 8 characters.">
            <Input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" disabled={busy}>
            Save new password
          </Button>
        </form>
      )}
    </div>
  )
}
