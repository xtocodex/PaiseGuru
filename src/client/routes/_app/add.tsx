import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { groupsQuery } from '../../queries.ts'
import { ButtonLink, Card, Empty, IconTile, Loading, Page, Row, Rows } from '../../ui.tsx'

export const Route = createFileRoute('/_app/add')({ component: AddChooser })

/** The "+" tab: straight to "add an expense" when there is one group, else pick which one. */
function AddChooser() {
  const navigate = useNavigate()
  const { data, isPending } = useQuery(groupsQuery())
  const active = data?.groups.filter((g) => g.status === 'active') ?? []
  useEffect(() => {
    if (active.length === 1) navigate({ to: '/groups/$id/add', params: { id: active[0]!.id }, replace: true })
  }, [active.length])
  if (isPending || active.length === 1) return <Loading />
  return (
    <Page title="Add to which group?" close back="/">
      {active.length === 0 ? (
        <Empty icon={Users} title="No groups yet" text="Create one first, then add its expenses." action={<ButtonLink to="/groups/new">Create a group</ButtonLink>} />
      ) : (
        <Card flush>
          <Rows>
            {active.map((g) => (
              <Row key={g.id} to="/groups/$id/add" params={{ id: g.id }} left={<IconTile icon={Users} />} title={g.name} subtitle={g.settleMode === 'monthly' ? 'Monthly' : 'Split as you go'} chevron />
            ))}
          </Rows>
        </Card>
      )}
    </Page>
  )
}
