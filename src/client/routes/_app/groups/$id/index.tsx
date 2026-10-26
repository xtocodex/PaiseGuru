import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCheck, ChevronRight, HandCoins, Plus, Settings, Wallet } from 'lucide-react'
import type { GroupView } from '../../../../api.ts'
import { ExpenseList } from '../../../../expense-list.tsx'
import { expensesQuery, groupQuery } from '../../../../queries.ts'
import { Avatar, Card, ErrorBox, IconButton, Loading, Money, NetText, Page, Row, Rows, SectionTitle, Tag, cx } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/$id/')({ component: GroupPage })

function GroupPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(groupQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Group" back="/groups"><ErrorBox error={error} /></Page>
  if (data.pending) {
    return (
      <Page title={data.name} back="/groups">
        <Card>You asked to join. You'll see everything once the admin approves you.</Card>
      </Page>
    )
  }
  return <GroupDetail g={data} />
}

function GroupDetail({ g }: { g: GroupView }) {
  const navigate = Route.useNavigate()
  const active = g.me.status === 'active'
  const monthly = g.settleMode === 'monthly'
  const [sheetId, setSheetId] = useState(g.sheets[0]?.id)
  const s = g.sheets.find((x) => x.id === sheetId) ?? g.sheets[0]
  const me = g.members.find((m) => m.isMe)
  const names = Object.fromEntries(g.members.map((m) => [m.id, m.name]))
  const mine = g.plan.filter((t) => t.from === g.me.memberId || t.to === g.me.memberId).length
  const fundNames = Object.fromEntries(g.funds.map((f) => [f.id, f.name]))
  const expenses = useQuery({ ...expensesQuery(g.id), enabled: !monthly })
  const pendingCount = g.members.filter((m) => m.status === 'pending').length

  return (
    <Page
      title={g.name}
      subtitle={`${monthly ? 'Monthly' : 'Split as you go'} · ${g.members.filter((m) => m.status === 'active').length} members`}
      back="/groups"
      action={
        <span className="relative">
          <IconButton icon={Settings} label="Members and settings" soft onClick={() => navigate({ to: '/groups/$id/settings', params: { id: g.id } })} />
          {pendingCount > 0 && g.me.role === 'admin' && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-marigold" aria-label={`${pendingCount} waiting for approval`} />}
        </span>
      }
    >
      {!active && <Card className="bg-marigold-soft text-sm">You have left this group. You can still look.</Card>}

      <section className="rounded-2xl bg-brand p-4 text-on-brand">
        <p className="text-[13px] opacity-80">Your balance</p>
        <p className="mt-1 text-[22px] leading-tight font-semibold [&_.text-gets]:text-white [&_.text-pays]:text-white [&_.text-muted]:text-white">
          <NetText paise={me?.netPaise ?? 0} />
        </p>
        {active && (
          <div className="mt-3.5 flex gap-2">
            <Link to="/groups/$id/add" params={{ id: g.id }} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-marigold text-sm font-semibold text-on-marigold">
              <Plus className="size-4" aria-hidden />
              Add expense
            </Link>
            <Link to="/groups/$id/settle" params={{ id: g.id }} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 text-sm font-semibold">
              <HandCoins className="size-4" aria-hidden />
              Settle up
              {/* Only your own payments: a count of everyone's reads as a to-do that isn't yours. */}
              {mine > 0 && <Tag tone="marigold">{mine}</Tag>}
            </Link>
          </div>
        )}
      </section>

      {monthly && g.sheets.length > 1 && (
        <div role="radiogroup" aria-label="Month" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {g.sheets.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === s?.id}
              onClick={() => setSheetId(x.id)}
              className={cx('press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium', x.id === s?.id ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card')}
            >
              {x.name.split(' ')[0]}
              {x.state === 'open' && <Tag>Open</Tag>}
            </button>
          ))}
        </div>
      )}

      {monthly && s && (
        <Card>
          <Link to="/sheets/$id" params={{ id: s.id }} className="press block">
            <p className="flex items-center justify-between text-[13px] text-muted">
              {s.name} · {s.state === 'open' ? 'open' : 'closed'}
              <ChevronRight className="size-5" aria-hidden />
            </p>
            <Money paise={s.totalPaise} className="mt-1 block text-[32px] leading-tight font-bold tracking-tight" />
            <p className="mt-1 text-[13px] text-muted">
              {s.entryCount} {s.entryCount === 1 ? 'entry' : 'entries'}
            </p>
          </Link>
          {active && s.state === 'open' && (
            <Link to="/sheets/$id/close" params={{ id: s.id }} className="press mt-3.5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-brand-text">
              <CheckCheck className="size-4" aria-hidden />
              Close {s.name.split(' ')[0]}
            </Link>
          )}
        </Card>
      )}

      {g.funds.map((f) => (
        <Card key={f.id}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">{f.name}</h2>
            <Wallet className="size-5 text-faint" aria-hidden />
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[13px] text-muted">Money in</dt>
              <dd><Money paise={f.inPaise} className="font-semibold" /></dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Used</dt>
              <dd><Money paise={f.usedPaise} className="font-semibold" /></dd>
            </div>
            <div className="text-right">
              <dt className="text-[13px] text-muted">Left now</dt>
              <dd><Money paise={f.balancePaise} className={cx('font-bold', f.balancePaise < 0 ? 'text-pays' : 'text-gets')} /></dd>
            </div>
          </dl>
          <p className="mt-2 text-[13px] text-muted">
            {f.holderMemberId ? `Held by ${names[f.holderMemberId]}. ` : ''}Never divided between members.
          </p>
        </Card>
      ))}

      <SectionTitle>Balances</SectionTitle>
      <Card flush>
        <Rows>
          {g.members
            .filter((m) => m.status !== 'pending')
            .map((m) => (
              <Row
                key={m.id}
                left={<Avatar name={m.name} me={m.isMe} muted={m.placeholder || m.status !== 'active'} />}
                title={m.isMe ? `${m.name} (you)` : m.name}
                subtitle={<NetText paise={m.netPaise} who={m.isMe ? 'You' : m.name.split(' ')[0]} />}
              />
            ))}
        </Rows>
      </Card>

      {!monthly && (
        <>
          <SectionTitle>Expenses</SectionTitle>
          <ErrorBox error={expenses.error} />
          {expenses.data && (
            <ExpenseList expenses={expenses.data.expenses} names={names} fundNames={fundNames} meId={g.me.memberId} groupId={g.id} empty="No expenses yet. Tap Add expense to add the first one." />
          )}
        </>
      )}
    </Page>
  )
}
