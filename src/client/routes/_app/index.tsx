import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatRupees } from '../../../domain/money.ts'
import type { HomeView } from '../../api.ts'
import { homeQuery } from '../../queries.ts'
import { ButtonLink, Card, ErrorBox, Loading, Money, Page, Tag } from '../../ui.tsx'

export const Route = createFileRoute('/_app/')({ component: Home })

type News = HomeView['news'][number]

/** Plain-English line for an activity row (S15). */
function newsText(n: News) {
  const who = n.actor ?? 'Someone'
  const p = (n.payload ?? {}) as { type?: string; amountPaise?: number; name?: string; into?: string }
  const amount = p.amountPaise ? formatRupees(p.amountPaise) : ''
  const what = { bill: 'a bill', refund: 'a refund', money_given: 'money given' }[p.type ?? ''] ?? 'an entry'
  switch (n.kind) {
    case 'entry_create': return `${who} added ${what} of ${amount}`
    case 'entry_edit': return `${who} changed ${what} to ${amount}`
    case 'entry_delete': return `${who} deleted ${what} of ${amount}`
    case 'close': return `${who} closed a month`
    case 'reopen': return `${who} reopened a month`
    case 'transfer_paid': return `${who} marked ${amount} as paid`
    case 'member_join': return `${p.name} joined`
    case 'member_claim': return `${who} joined as ${p.name}`
    case 'member_approve': return `${who} approved ${p.name}`
    case 'member_unclaim': return `${who} undid ${p.name}'s join`
    case 'member_merge': return `${who} linked ${p.name} to ${p.into}`
    case 'member_leave': return `${p.name} left`
    case 'member_remove': return `${who} removed ${p.name}`
    case 'admin_handover': return `${p.name} is now the admin`
    case 'placeholder_add': return `${who} added ${p.name}`
    default: return `${who} made a change`
  }
}

function Home() {
  const { data, error, isPending } = useQuery(homeQuery())
  if (isPending) return <Loading />
  if (!data) return <ErrorBox error={error} />

  return (
    <Page title="PaiseGuru" action={<ButtonLink to="/hisaabs/new" variant="ghost">+ New Hisaab</ButtonLink>}>
      <Card>
        <p className="text-sm text-slate-500">{data.monthName} · your spending</p>
        <Money paise={data.spendPaise} className="text-3xl font-bold" />
        <p className="mt-1 text-xs text-slate-500">Your share of months that are closed. Open months show an estimate below.</p>
      </Card>

      {data.payments.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Payments waiting</h2>
          <ul className="divide-y divide-slate-100">
            {data.payments.map((p) => (
              <li key={p.id}>
                <Link to="/sheets/$id" params={{ id: p.sheetId }} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <span>
                    {p.iPay ? `You pay ${p.toName}` : `${p.fromName} pays you`}
                    <span className="block text-xs text-slate-500">
                      {p.hisaabName} · {p.sheetName}
                    </span>
                  </span>
                  <Money paise={p.amountPaise} className={p.iPay ? 'font-semibold text-red-700' : 'font-semibold text-brand'} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.pending.map((h) => (
        <Card key={h.id}>
          <p className="font-semibold">{h.name}</p>
          <p className="text-sm text-slate-600">Waiting for the admin to approve you.</p>
        </Card>
      ))}

      {data.hisaabs.length === 0 && data.pending.length === 0 && (
        <Card className="text-center">
          <p className="font-semibold">No Hisaab yet</p>
          <p className="mb-3 text-sm text-slate-600">A Hisaab collects shared bills all month, then divides them once at month-end.</p>
          <ButtonLink to="/hisaabs/new">Create a Hisaab</ButtonLink>
        </Card>
      )}

      {data.hisaabs.map((h) => (
        <Card key={h.id}>
          <Link to="/hisaabs/$id" params={{ id: h.id }} className="mb-1 flex min-h-11 items-center justify-between font-semibold">
            {h.name} <span className="text-slate-400">›</span>
          </Link>
          <ul className="divide-y divide-slate-100">
            {h.lines.map((l) => (
              <li key={l.sheetId}>
                <Link to="/sheets/$id" params={{ id: l.sheetId }} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                  <span>
                    {l.sheetName}
                    {l.estimate ? ' so far ' : ' '}
                    {l.estimate && <Tag>not closed yet</Tag>}
                  </span>
                  {l.myPaise === null ? <span className="text-slate-400">–</span> : <Money paise={l.myPaise} />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {data.news.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">New since your last visit ({data.news.length})</h2>
          <ul className="space-y-2 text-sm">
            {data.news.map((n) => (
              <li key={n.id}>
                {newsText(n)}
                <span className="block text-xs text-slate-500">{n.hisaabName}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
