import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, Plus, Users } from 'lucide-react'
import { groupsQuery } from '../../../queries.ts'
import { ButtonLink, Card, Empty, ErrorBox, IconButton, IconTile, Loading, NetText, Page } from '../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/')({ component: Groups })

function Groups() {
  const navigate = useNavigate()
  const { data, error, isPending } = useQuery(groupsQuery())
  if (isPending) return <Loading />
  return (
    <Page title="Groups" action={<IconButton icon={Plus} label="New group" soft onClick={() => navigate({ to: '/groups/new' })} />}>
      <ErrorBox error={error} />
      {data?.groups.map((g) => (
        <Link key={g.id} to="/groups/$id" params={{ id: g.id }} className="press block">
          <Card>
            <div className="flex items-center gap-3">
              <IconTile icon={g.settleMode === 'monthly' ? CalendarDays : Users} tone={g.settleMode === 'monthly' ? 'brand' : 'marigold'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold">{g.name}</p>
                <p className="truncate text-[13px] text-muted">
                  {[
                    g.settleMode === 'monthly' ? 'Monthly' : 'Split as you go',
                    g.memberCount && `${g.memberCount} members`,
                    g.status === 'pending' && 'waiting for approval',
                    g.status === 'former' && 'you left',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <ChevronRight className="size-5 text-faint" aria-hidden />
            </div>
            {g.status === 'active' && (
              <p className="mt-3 border-t border-line pt-3 text-[15px]">
                <NetText paise={g.myNetPaise} />
              </p>
            )}
          </Card>
        </Link>
      ))}
      <Empty
        icon={Users}
        title={data?.groups.length ? 'Start another group' : 'No groups yet'}
        text="For a flat, a trip, friends, a couple, or a parent's care."
        action={<ButtonLink to="/groups/new">Create a group</ButtonLink>}
      />
    </Page>
  )
}
