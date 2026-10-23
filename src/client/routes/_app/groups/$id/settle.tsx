import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import { istDate, shortDate } from '../../../../../domain/group.ts'
import { formatRupees } from '../../../../../domain/money.ts'
import { api, call, type GroupView } from '../../../../api.ts'
import { PaymentSlip } from '../../../../payment-slip.tsx'
import { groupQuery, paymentsQuery } from '../../../../queries.ts'
import { Avatar, Button, Card, ErrorBox, Loading, Money, Page, Row, Rows, SectionTitle, Tag } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/$id/settle')({ component: SettlePage })

function SettlePage() {
  const { id } = Route.useParams()
  const g = useQuery(groupQuery(id))
  const payments = useQuery(paymentsQuery(id))
  if (g.isPending) return <Loading />
  if (!g.data || g.data.pending) return <Page title="Settle up" back={`/groups/${id}`}><ErrorBox error={g.error} /></Page>
  return <Settle g={g.data} payments={payments.data?.payments ?? []} />
}

/** Why this payment: it moves money from someone who owes to someone who is owed, never more than either. */
function reason(g: GroupView, from: string, to: string) {
  const m = (id: string) => g.members.find((x) => x.id === id)!
  const f = m(from)
  const t = m(to)
  return `${f.isMe ? 'You owe' : `${f.name} owes`} ${formatRupees(-f.netPaise)} in total; ${t.isMe ? 'you are' : `${t.name} is`} owed ${formatRupees(t.netPaise)}.`
}

function Settle({ g, payments }: { g: GroupView; payments: { id: string; from: string; to: string; amountPaise: number; status: string; via: string; utr: string | null; createdAt: string }[] }) {
  const queryClient = useQueryClient()
  const names = Object.fromEntries(g.members.map((m) => [m.id, m.name]))
  const placeholder = (id: string) => g.members.find((m) => m.id === id)?.placeholder ?? false
  const active = g.me.status === 'active'
  const meId = g.me.memberId
  const done = () => queryClient.invalidateQueries()
  const confirm_ = useMutation({ mutationFn: (id: string) => call(api.payments[':id'].confirm.$post({ param: { id } })), onSuccess: done })
  const remove = useMutation({ mutationFn: (id: string) => call(api.payments[':id'].$delete({ param: { id } })), onSuccess: done })
  const name = (id: string) => (id === meId ? 'You' : names[id])

  return (
    <Page title="Settle up" subtitle={g.name} back={`/groups/${g.id}`}>
      {g.plan.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-gets-soft text-gets">
            <CircleCheck className="size-8" aria-hidden />
          </span>
          <p className="text-lg font-semibold">Everyone is settled</p>
          <p className="text-sm text-muted">Nobody owes anything in this group.</p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted">
            {g.plan.length === 1 ? 'One payment settles' : `${g.plan.length} payments settle`} everyone. Pay any of them; the others stay the same.
          </p>
          {g.plan.map((t) => (
            <PaymentSlip
              key={`${t.from}-${t.to}`}
              t={t}
              names={names}
              meMemberId={meId}
              groupId={g.id}
              groupName={g.name}
              upiId={g.upiIds[t.to] ?? null}
              subtitle={reason(g, t.from, t.to)}
              canRecord={active && (t.from === meId || t.to === meId || placeholder(t.from) || placeholder(t.to))}
            />
          ))}
        </>
      )}

      {payments.length > 0 && (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card flush>
            <Rows>
              {payments.map((p) => {
                const party = p.from === meId || p.to === meId || placeholder(p.from) || placeholder(p.to)
                return (
                  <Row
                    key={p.id}
                    left={<Avatar name={names[p.from] ?? '?'} id={p.from} />}
                    title={`${name(p.from)} paid ${p.to === meId ? 'you' : names[p.to]}`}
                    subtitle={
                      <span className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {shortDate(istDate(new Date(p.createdAt)))} · {{ upi: 'UPI', cash: 'Cash', other: 'Other' }[p.via]}
                          {p.utr && ` · Ref ${p.utr}`}
                          <Tag tone={p.status === 'confirmed' ? 'gets' : 'marigold'}>{p.status === 'confirmed' ? 'Confirmed' : 'Sent'}</Tag>
                        </span>
                        {active && p.status === 'sent' && p.to === meId && (
                          <span className="flex gap-2">
                            <Button size="sm" variant="secondary" className="h-9" onClick={() => confirm('Not received? The balance goes back.') && remove.mutate(p.id)}>
                              Not received
                            </Button>
                            <Button size="sm" className="h-9" onClick={() => confirm_.mutate(p.id)}>
                              Got it
                            </Button>
                          </span>
                        )}
                        {active && p.status === 'sent' && party && p.to !== meId && (
                          <span>
                            <Button size="sm" variant="secondary" className="h-9 text-pays" onClick={() => confirm('Remove this payment? The balance goes back.') && remove.mutate(p.id)}>
                              Undo
                            </Button>
                          </span>
                        )}
                      </span>
                    }
                    right={<Money paise={p.amountPaise} className="text-[15px] font-semibold" />}
                  />
                )
              })}
            </Rows>
          </Card>
          <ErrorBox error={confirm_.error ?? remove.error} />
        </>
      )}
    </Page>
  )
}
