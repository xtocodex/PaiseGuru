import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, HeartHandshake, NotebookPen, Plus, Users } from 'lucide-react'
import { hisaabsQuery } from '../../../queries.ts'
import { ButtonLink, Card, Empty, ErrorBox, IconButton, IconTile, Loading, Money, Page, Tag } from '../../../ui.tsx'
import { useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/hisaabs/')({ component: Hisaabs })

function Hisaabs() {
  const navigate = useNavigate()
  const { data, error, isPending } = useQuery(hisaabsQuery())
  if (isPending) return <Loading />
  return (
    <Page title="Hisaabs" action={<IconButton icon={Plus} label="New Hisaab" soft onClick={() => navigate({ to: '/hisaabs/new' })} />}>
      <ErrorBox error={error} />
      {data?.hisaabs.map((h) => (
        <Link key={h.id} to="/hisaabs/$id" params={{ id: h.id }} className="press block">
          <Card>
            <div className="flex items-center gap-3">
              <IconTile icon={h.forLabel ? HeartHandshake : Users} tone={h.forLabel ? 'brand' : 'marigold'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold">{h.name}</p>
                <p className="truncate text-[13px] text-muted">
                  {[h.forLabel && `For ${h.forLabel}`, h.memberCount && `${h.memberCount} members`, h.role === 'admin' && h.status === 'active' && "you're the admin", h.status === 'pending' && 'waiting for approval', h.status === 'former' && 'you left']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <ChevronRight className="size-5 text-faint" aria-hidden />
            </div>
            {h.recent.length > 0 && (
              <div className="mt-3.5 flex justify-between gap-3 border-t border-line pt-3">
                {h.recent.map((s, i) => (
                  <div key={s.id} className={i ? 'text-right' : ''}>
                    <p className="text-[13px] text-muted">{s.name.split(' ')[0]}</p>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Money paise={s.totalPaise} />
                      {s.state === 'open' ? <Tag>Open</Tag> : s.unpaidCount ? <Tag tone="marigold">{s.unpaidCount} to pay</Tag> : <Tag tone="gets">Settled</Tag>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Link>
      ))}
      <Empty
        icon={NotebookPen}
        title={data?.hisaabs.length ? 'Start another Hisaab' : 'No Hisaab yet'}
        text="For a parent, a flat, a trip or a mess."
        action={<ButtonLink to="/hisaabs/new">Create Hisaab</ButtonLink>}
      />
    </Page>
  )
}
