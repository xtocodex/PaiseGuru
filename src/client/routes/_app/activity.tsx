import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { ACTIVITY_GROUP, activityText, timeAgo } from '../../activity-text.ts'
import type { ActivityView } from '../../api.ts'
import { activityQuery } from '../../queries.ts'
import { Avatar, Card, Chips, Empty, ErrorBox, Loading, Page, Row, Rows } from '../../ui.tsx'

export const Route = createFileRoute('/_app/activity')({ component: ActivityPage })

type Filter = 'all' | 'bills' | 'payments' | 'members'
type Item = ActivityView['items'][number]

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
function dayLabel(key: string) {
  const today = dayKey(new Date().toISOString())
  const yesterday = dayKey(new Date(Date.now() - 864e5).toISOString())
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function ActivityPage() {
  const { user } = Route.useRouteContext()
  const [filter, setFilter] = useState<Filter>('all')
  const { data, error, isPending } = useQuery(activityQuery())
  if (isPending) return <Loading />
  const items = (data?.items ?? []).filter((i) => filter === 'all' || ACTIVITY_GROUP[i.kind] === filter)
  const groups = new Map<string, Item[]>()
  for (const i of items) groups.set(dayKey(i.createdAt), [...(groups.get(dayKey(i.createdAt)) ?? []), i])

  return (
    <Page title="Activity">
      <Chips
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'bills', label: 'Bills' },
          { value: 'payments', label: 'Payments' },
          { value: 'members', label: 'Members' },
        ]}
      />
      <ErrorBox error={error} />
      {items.length === 0 && <Empty icon={Activity} title="Nothing here yet" text="Bills, payments and members your family changes show up here." />}
      {[...groups].map(([day, list]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-muted">{dayLabel(day)}</h2>
          <Card flush>
            <Rows>
              {list.map((n) => (
                <Row
                  key={n.id}
                  to={n.sheetId ? '/sheets/$id' : '/hisaabs/$id'}
                  params={{ id: n.sheetId ?? n.hisaabId }}
                  left={<Avatar name={n.actor ?? '?'} id={n.actor ?? n.hisaabId} />}
                  title={activityText(n, n.mine ? user.name : undefined)}
                  subtitle={[n.hisaabName, n.sheetName?.split(' ')[0], timeAgo(n.createdAt)].filter(Boolean).join(' · ')}
                />
              ))}
            </Rows>
          </Card>
        </section>
      ))}
    </Page>
  )
}
