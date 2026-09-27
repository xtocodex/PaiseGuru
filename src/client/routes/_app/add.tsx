import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { NotebookPen } from 'lucide-react'
import { hisaabsQuery } from '../../queries.ts'
import { ButtonLink, Card, Empty, IconTile, Loading, Page, Row, Rows } from '../../ui.tsx'

export const Route = createFileRoute('/_app/add')({ component: AddChooser })

/** The "+" tab: straight to "add a bill" when there is one Hisaab, else pick which one. */
function AddChooser() {
  const navigate = useNavigate()
  const { data, isPending } = useQuery(hisaabsQuery())
  const active = data?.hisaabs.filter((h) => h.status === 'active') ?? []
  useEffect(() => {
    if (active.length === 1) navigate({ to: '/hisaabs/$id/add', params: { id: active[0]!.id }, replace: true })
  }, [active.length])
  if (isPending || active.length === 1) return <Loading />
  return (
    <Page title="Add to which Hisaab?" close back="/">
      {active.length === 0 ? (
        <Empty icon={NotebookPen} title="No Hisaab yet" text="Create one first, then add its bills." action={<ButtonLink to="/hisaabs/new">Create Hisaab</ButtonLink>} />
      ) : (
        <Card flush>
          <Rows>
            {active.map((h) => (
              <Row key={h.id} to="/hisaabs/$id/add" params={{ id: h.id }} left={<IconTile icon={NotebookPen} />} title={h.name} subtitle={h.forLabel ? `For ${h.forLabel}` : undefined} chevron />
            ))}
          </Rows>
        </Card>
      )}
    </Page>
  )
}
