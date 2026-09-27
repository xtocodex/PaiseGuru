import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NotebookPen } from 'lucide-react'
import { api, call } from '../../../api.ts'
import { Avatar, Button, ButtonLink, Card, ErrorBox, IconTile, Loading, Page, Row, Rows } from '../../../ui.tsx'

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
      navigate({ to: '/hisaabs/$id', params: { id: out.hisaabId }, replace: true })
    },
  })

  if (preview.isPending) return <Loading />
  const p = preview.data
  if (!p) return <Page title="Join" close back="/"><ErrorBox error={preview.error} /></Page>
  if (p.myStatus === 'active' || p.myStatus === 'pending') {
    return (
      <Page title={p.name} close back="/">
        <Card>
          <p>{p.myStatus === 'active' ? 'You are already a member.' : 'You asked to join. Waiting for the admin to approve you.'}</p>
        </Card>
        <ButtonLink to="/hisaabs/$id" params={{ id: p.hisaabId }}>
          Open {p.name}
        </ButtonLink>
      </Page>
    )
  }

  return (
    <Page title={`Join ${p.name}`} close back="/">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <IconTile icon={NotebookPen} />
        <p className="text-sm text-muted">You've been invited to share this Hisaab's bills and settle up each month.</p>
      </div>
      {p.placeholders.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold">Which one is you?</h2>
          <p className="-mt-2 text-[13px] text-muted">If someone already added you by name, pick it so your past bills stay with you.</p>
          <Card flush>
            <Rows>
              {p.placeholders.map((m) => (
                <Row key={m.id} onClick={() => join.mutate(m.id)} left={<Avatar name={m.name} id={m.id} />} title={`I'm ${m.name}`} chevron />
              ))}
            </Rows>
          </Card>
        </>
      )}
      <Button variant={p.placeholders.length ? 'secondary' : 'primary'} onClick={() => join.mutate(undefined)} disabled={join.isPending}>
        {p.placeholders.length ? "I'm new here" : `Join ${p.name}`}
      </Button>
      <ErrorBox error={join.error} />
    </Page>
  )
}
