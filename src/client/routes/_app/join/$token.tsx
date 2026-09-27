import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, call } from '../../../api.ts'
import { Button, ButtonLink, Card, ErrorBox, Loading, Page } from '../../../ui.tsx'

export const Route = createFileRoute('/_app/join/$token')({ component: Join })

function Join() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const preview = useQuery({ queryKey: ['join', token], queryFn: () => call(api.join[':token'].$get({ param: { token } })) })
  const join = useMutation({
    mutationFn: (placeholderId?: string) => call(api.join[':token'].$post({ param: { token }, json: placeholderId ? { placeholderId } : {} })),
    onSuccess: (out) => {
      queryClient.invalidateQueries()
      navigate({ to: '/hisaabs/$id', params: { id: out.hisaabId } })
    },
  })

  if (preview.isPending) return <Loading />
  const p = preview.data
  if (!p) return <Page title="Join"><ErrorBox error={preview.error} /></Page>
  if (p.myStatus === 'active' || p.myStatus === 'pending') {
    return (
      <Page title={p.name}>
        <Card className="space-y-3">
          <p>{p.myStatus === 'active' ? 'You are already a member.' : 'You asked to join. Waiting for the admin to approve you.'}</p>
          <ButtonLink to="/hisaabs/$id" params={{ id: p.hisaabId }}>Open {p.name}</ButtonLink>
        </Card>
      </Page>
    )
  }

  return (
    <Page title={`Join ${p.name}`}>
      {p.placeholders.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Which one is you?</h2>
          <p className="mb-3 text-sm text-slate-600">If someone already added you by name, pick it so your past bills stay with you.</p>
          <div className="grid gap-2">
            {p.placeholders.map((m) => (
              <Button key={m.id} variant="secondary" onClick={() => join.mutate(m.id)} disabled={join.isPending}>
                I'm {m.name}
              </Button>
            ))}
          </div>
        </Card>
      )}
      <Button className="w-full" onClick={() => join.mutate(undefined)} disabled={join.isPending}>
        {p.placeholders.length ? "I'm new here" : `Join ${p.name}`}
      </Button>
      <ErrorBox error={join.error} />
    </Page>
  )
}
