import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { istDate, shortDate } from '../../../../../domain/group.ts'
import { formatRupees } from '../../../../../domain/money.ts'
import { api, call, type GroupView } from '../../../../api.ts'
import { PaymentSlip } from '../../../../payment-slip.tsx'
import { groupQuery, paymentsQuery, preload } from '../../../../queries.ts'
import { Avatar, Button, Card, ErrorBox, Loading, Money, Page, Row, Rows, SectionTitle, Tag, askConfirm, haptic, toast } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/$id/settle')({ loader: ({ context: { queryClient }, params }) => preload(queryClient, groupQuery(params.id), paymentsQuery(params.id)), component: SettlePage })

function SettlePage() {
  const { id } = Route.useParams()
  const g = useQuery(groupQuery(id))
  const payments = useQuery(paymentsQuery(id))
  if (g.isPending) return <Loading />
  if (!g.data || g.data.pending) return <Page title="Settle up" back={`/groups/${id}`}><ErrorBox error={g.error} /></Page>
  return <Settle g={g.data} payments={payments.data?.payments ?? []} />
}

/** The logo's upward sweep circling a tick: drawn once when a group has nothing left to settle. */
function SettledMark() {
  return (
    <svg viewBox="0 0 72 72" className="size-20" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="36" cy="36" r="27" className="fill-gets-soft" />
      <path d="M12 46 C 18 62, 46 66, 58 46 S 60 14, 40 9" className="settled-sweep stroke-brand-2" strokeWidth="4" style={{ ['--len' as string]: 120 }} />
      <path d="M40 9 l7 -1 m-7 1 l3 6" className="settled-tick stroke-brand-2" strokeWidth="4" style={{ ['--len' as string]: 14 }} />
      <path d="M25 37 l8 8 l15 -17" className="settled-tick stroke-gets" strokeWidth="5" style={{ ['--len' as string]: 36 }} />
    </svg>
  )
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
  const done = (note: string) => () => {
    queryClient.invalidateQueries()
    haptic()
    toast(note)
  }
  const confirm_ = useMutation({ mutationFn: (id: string) => call(api.payments[':id'].confirm.$post({ param: { id } })), onSuccess: done('Payment confirmed') })
  const remove = useMutation({ mutationFn: (id: string) => call(api.payments[':id'].$delete({ param: { id } })), onSuccess: done('Payment removed. The balance is back.') })
  const name = (id: string) => (id === meId ? 'You' : names[id])

  return (
    <Page title="Settle up" subtitle={g.name} back={`/groups/${g.id}`}>
      {g.plan.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <SettledMark />
          <p className="text-heading font-semibold">{g.name} is settled</p>
          <p className="text-body text-muted">Nobody owes anything. Hisaab clear.</p>
        </Card>
      ) : (
        <>
          <p className="text-body text-muted">
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
                    left={<Avatar name={names[p.from] ?? '?'} me={p.from === meId} />}
                    title={`${name(p.from)} paid ${p.to === meId ? 'you' : names[p.to]}`}
                    subtitle={
                      <span className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {shortDate(istDate(new Date(p.createdAt)))} · {{ upi: 'UPI', cash: 'Cash', other: 'Other' }[p.via]}
                          {p.utr && ` · Ref ${p.utr}`}
                          <Tag tone={p.status === 'confirmed' ? 'gets' : 'marigold'}>{p.status === 'confirmed' ? 'Confirmed' : 'Sent'}</Tag>
                        </span>
                        {active && p.status === 'sent' && p.to === meId && (
                          <span className="flex gap-3">
                            <Button size="sm" variant="secondary" onClick={async () => (await askConfirm({ title: 'Not received?', text: `The ${formatRupees(p.amountPaise)} goes back to what ${names[p.from]} owes.`, confirm: 'Not received', danger: true })) && remove.mutate(p.id)}>
                              Not received
                            </Button>
                            <Button size="sm" className="flex-1" onClick={() => confirm_.mutate(p.id)}>
                              Got it
                            </Button>
                          </span>
                        )}
                        {active && p.status === 'sent' && party && p.to !== meId && (
                          <span>
                            <Button size="sm" variant="secondary" className="text-pays" onClick={async () => (await askConfirm({ title: 'Remove this payment?', text: 'The balance goes back to before it.', confirm: 'Remove payment', danger: true })) && remove.mutate(p.id)}>
                              Undo
                            </Button>
                          </span>
                        )}
                      </span>
                    }
                    right={<Money paise={p.amountPaise} className="text-body font-semibold" />}
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
