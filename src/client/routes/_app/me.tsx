import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UPI_ID } from '../../../shared/schemas.ts'
import { api, call } from '../../api.ts'
import { authClient } from '../../auth.ts'
import { meQuery } from '../../queries.ts'
import { Button, Card, ErrorBox, FOUNDER_URL, Field, Input, Loading, Page } from '../../ui.tsx'

export const Route = createFileRoute('/_app/me')({ component: Me })

function Me() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const me = useQuery(meQuery())
  const [upiError, setUpiError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: (v: { name: string; upiId: string }) => call(api.me.$patch({ json: v })),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
  const signOut = async () => {
    await authClient.signOut()
    queryClient.clear()
    navigate({ to: '/login' })
  }
  const remove = useMutation({ mutationFn: () => call(api.me.$delete()), onSuccess: signOut })

  if (me.isPending) return <Loading />
  if (!me.data) return <ErrorBox error={me.error} />

  return (
    <Page title="Me">
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const upiId = String(f.get('upiId')).trim()
            if (upiId && !UPI_ID.test(upiId)) return setUpiError('This does not look like a UPI ID (like name@bank).')
            setUpiError(null)
            setSaved(false)
            save.mutate({ name: String(f.get('name')), upiId })
          }}
        >
          <p className="text-sm text-slate-500">{me.data.username ? `User ID: ${me.data.username}` : me.data.email}</p>
          <Field label="Name">
            <Input name="name" defaultValue={me.data.name} required maxLength={60} />
          </Field>
          <Field label="UPI ID" hint="So members can pay you with one tap. Only members of your Hisaabs see it." error={upiError}>
            <Input name="upiId" defaultValue={me.data.upiId ?? ''} placeholder="name@bank" autoCapitalize="none" autoCorrect="off" />
          </Field>
          <ErrorBox error={save.error} />
          {saved && <p className="text-sm text-brand">Saved.</p>}
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </form>
      </Card>

      <Button variant="secondary" className="w-full" onClick={signOut}>
        Sign out
      </Button>

      <Card>
        <h2 className="font-semibold">About PaiseGuru</h2>
        <p className="mt-1 text-sm text-slate-600">
          PaiseGuru is a product of <b>xtocodex</b>, built by founder Gopal Mohapatra.
        </p>
        <a href={FOUNDER_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand">
          gopalmohapatra.in ↗
        </a>
      </Card>

      <Card>
        <h2 className="font-semibold text-red-800">Delete my account</h2>
        <p className="my-2 text-sm text-slate-600">
          Your name, email and UPI ID are deleted. Amounts you added stay in shared Hisaabs under "Deleted user", so nobody else's numbers change.
        </p>
        <ErrorBox error={remove.error} />
        <Button variant="danger" onClick={() => prompt('Type DELETE to delete your account') === 'DELETE' && remove.mutate()}>
          Delete account
        </Button>
      </Card>
    </Page>
  )
}
