import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Lock, MessageCircle } from 'lucide-react'
import { formatRupees, parseRupees } from '../../../../../domain/money.ts'
import { api, call, type SheetView } from '../../../../api.ts'
import { PaymentSlip } from '../../../../payment-slip.tsx'
import { sheetQuery } from '../../../../queries.ts'
import { Avatar, Button, ButtonLink, Card, Chips, ErrorBox, Input, Loading, Money, Page, Row, Rows, SectionTitle, Segmented, Tag, cx } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/sheets/$id/close')({ component: ClosePage })

type Exception = 'none' | 'fixed' | 'extra' | 'skip'
type Change = { memberId: string; exception: Exception; exceptionPaise: number }

function ClosePage() {
  const { id } = Route.useParams()
  const { data, error, isPending, isFetching } = useQuery(sheetQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Close month" close back={`/sheets/${id}`}><ErrorBox error={error} /></Page>
  return <Close s={data} fetching={isFetching} />
}

/** `fetching`: the month is reloading after a change; wait for its new version before closing. */
function Close({ s, fetching }: { s: SheetView; fetching: boolean }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2>(1)
  const r = s.result
  const month = s.sheet.name.split(' ')[0]
  const name = (id: string) => s.names[id] ?? ''

  // Several exception changes in a row: each PUT bumps the sheet version by one.
  const apply = useMutation({
    mutationFn: async (changes: Change[]) => {
      let version = s.sheet.version
      for (const c of changes) {
        await call(api.sheets[':id'].participants[':mid'].$put({ param: { id: s.sheet.id, mid: c.memberId }, json: { exception: c.exception, exceptionPaise: c.exceptionPaise, version: version++ } }))
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sheet', s.sheet.id] }),
  })
  const close = useMutation({
    mutationFn: async () => {
      await call(api.sheets[':id'].close.$post({ param: { id: s.sheet.id }, json: { version: s.sheet.version } }))
      return call(api.sheets[':id'].statement.$post({ param: { id: s.sheet.id } }))
    },
    onSettled: () => queryClient.invalidateQueries(),
  })

  if (close.data) {
    return (
      <Page title={`${month} closed`} close back={`/sheets/${s.sheet.id}`}>
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-gets-soft text-gets">
            <CircleCheck className="size-9" aria-hidden />
          </span>
          <p className="text-xl font-bold">{s.sheet.name} is closed</p>
          <p className="max-w-xs text-sm text-muted">Send everyone the result. The link shows every entry and how it was divided.</p>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          {close.data.share && (
            <a href={close.data.share.waLink} target="_blank" rel="noreferrer" className="press inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-gets font-semibold text-on-gets">
              <MessageCircle className="size-5" aria-hidden />
              Share on WhatsApp
            </a>
          )}
          <ButtonLink to="/sheets/$id" params={{ id: s.sheet.id }} variant="secondary">
            See payments
          </ButtonLink>
        </div>
      </Page>
    )
  }

  if (s.sheet.state !== 'open') {
    return (
      <Page title="Close month" close back={`/sheets/${s.sheet.id}`}>
        <Card>
          This month is already closed.{' '}
          <Link to="/sheets/$id" params={{ id: s.sheet.id }} className="font-semibold text-brand-text underline">
            See it
          </Link>
        </Card>
      </Page>
    )
  }

  const steps = (
    <div className="flex gap-1.5" aria-hidden>
      <i className="h-1 flex-1 rounded-full bg-brand" />
      <i className={cx('h-1 flex-1 rounded-full', step === 2 ? 'bg-brand' : 'bg-line')} />
    </div>
  )

  if (step === 1) {
    return (
      <Page
        title={`Close ${month}`}
        subtitle="Step 1 of 2 · who pays what"
        close
        back={`/sheets/${s.sheet.id}`}
        footer={
          <Button className="w-full" disabled={!r.ok || apply.isPending || fetching} onClick={() => setStep(2)}>
            See who pays whom
          </Button>
        }
      >
        {steps}
        <Card>
          <p className="text-[13px] text-muted">To divide between {s.participants.filter((p) => p.exception !== 'skip').length} members</p>
          {r.ok ? <Money paise={r.dividablePaise} className="text-[40px] leading-tight font-bold tracking-tight" /> : <p role="alert" className="mt-1 font-medium text-pays">{r.message}</p>}
          {r.ok && r.dividablePaise !== r.totalPaise && (
            <p className="mt-1 text-[13px] text-muted">
              Plus <Money paise={r.totalPaise - r.dividablePaise} /> {s.hisaab.forLabel ? `from ${s.hisaab.forLabel}'s money` : 'outside the split'}, not divided
            </p>
          )}
        </Card>

        <PaysMore s={s} pending={apply.isPending} onApply={(c) => apply.mutate(c)} />
        <ErrorBox error={apply.error} />

        <Card flush>
          <Rows>
            {s.participants.map((p) => {
              const m = r.ok ? r.members.find((x) => x.memberId === p.memberId) : null
              const skipped = p.exception === 'skip'
              return (
                <Row
                  key={p.memberId}
                  left={<Avatar name={p.name} id={p.memberId} muted={skipped} />}
                  title={p.name}
                  subtitle={
                    p.exception === 'fixed' ? (
                      <Tag tone="marigold">Fixed {formatRupees(p.exceptionPaise)}</Tag>
                    ) : p.exception === 'extra' ? (
                      <Tag tone="marigold">+{formatRupees(p.exceptionPaise)} extra</Tag>
                    ) : skipped ? (
                      'Skips this month'
                    ) : undefined
                  }
                  right={
                    <span className="flex items-center gap-1">
                      {m ? <Money paise={m.obligationPaise} className="text-[15px] font-semibold" /> : <span className="text-faint">–</span>}
                      <Button size="sm" variant="ghost" disabled={apply.isPending} onClick={() => apply.mutate([{ memberId: p.memberId, exception: skipped ? 'none' : 'skip', exceptionPaise: 0 }])}>
                        {skipped ? 'Include' : 'Skip'}
                      </Button>
                    </span>
                  }
                />
              )
            })}
          </Rows>
        </Card>
      </Page>
    )
  }

  return (
    <Page
      title={`Close ${month}`}
      subtitle="Step 2 of 2 · settle up"
      close
      back={`/sheets/${s.sheet.id}`}
      footer={
        <div className="flex flex-col gap-2">
          <ErrorBox error={close.error} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button className="flex-1" icon={Lock} disabled={!r.ok || close.isPending || fetching} onClick={() => close.mutate()}>
              Close month and share
            </Button>
          </div>
          <p className="text-center text-[13px] text-muted">Bills added after closing go into next month.</p>
        </div>
      }
    >
      {steps}
      {r.ok && (
        <>
          <Card flush>
            <Rows>
              {r.members.map((m) => (
                <Row
                  key={m.memberId}
                  left={<Avatar name={name(m.memberId)} id={m.memberId} />}
                  title={name(m.memberId)}
                  subtitle={`Paid ${formatRupees(m.paidPaise)} · share ${formatRupees(m.obligationPaise)}`}
                  right={
                    <span className={cx('num text-[15px] font-semibold', m.netPaise > 0 ? 'text-gets' : m.netPaise < 0 ? 'text-pays' : 'text-muted')}>
                      {m.netPaise > 0 ? `gets ${formatRupees(m.netPaise)}` : m.netPaise < 0 ? `pays ${formatRupees(-m.netPaise)}` : 'settled'}
                    </span>
                  }
                />
              ))}
            </Rows>
          </Card>
          <SectionTitle>{r.transfers.length === 0 ? 'Nothing to pay: everyone is settled' : `${r.transfers.length} ${r.transfers.length === 1 ? 'payment settles' : 'payments settle'} everyone`}</SectionTitle>
          {r.transfers.map((t, i) => (
            <PaymentSlip key={i} t={{ id: String(i), from: t.from, to: t.to, amountPaise: t.amountPaise, status: 'unpaid' }} names={s.names} meMemberId={s.me.memberId} hisaabName={s.hisaab.name} />
          ))}
        </>
      )}
    </Page>
  )
}

/** One member pays more: a fixed total, or an extra amount on top of an equal share (S7 exceptions). */
function PaysMore({ s, pending, onApply }: { s: SheetView; pending: boolean; onApply: (changes: Change[]) => void }) {
  const current = s.participants.find((p) => p.exception === 'fixed' || p.exception === 'extra')
  const [who, setWho] = useState<string>(current?.memberId ?? 'none')
  const [kind, setKind] = useState<'fixed' | 'extra'>(current?.exception === 'fixed' ? 'fixed' : 'extra')
  const [amount, setAmount] = useState(current ? formatRupees(current.exceptionPaise).replace('₹', '') : '')
  const [error, setError] = useState<string | null>(null)
  const people = s.participants.filter((p) => p.exception !== 'skip')
  const pickedName = people.find((p) => p.memberId === who)?.name
  const paise = parseRupees(amount)
  const r = s.result

  const clearOthers = (keep?: string) =>
    s.participants
      .filter((p) => p.memberId !== keep && (p.exception === 'fixed' || p.exception === 'extra'))
      .map((p) => ({ memberId: p.memberId, exception: 'none' as const, exceptionPaise: 0 }))

  const unchanged = current ? current.memberId === who && current.exception === kind && current.exceptionPaise === paise : who === 'none'

  return (
    <section className="rounded-2xl border-2 border-marigold bg-card p-4">
      <h2 className="text-[15px] font-semibold">Does someone pay more this month?</h2>
      <div className="mt-3 flex flex-col gap-3">
        <Chips label="Who pays more" value={who} onChange={setWho} options={[...people.map((p) => ({ value: p.memberId, label: p.name })), { value: 'none', label: 'No one' }]} />
        {who !== 'none' && (
          <>
            <Segmented
              label="How"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'fixed', label: 'Fixed amount' },
                { value: 'extra', label: 'Extra on top' },
              ]}
            />
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">Amount (₹)</span>
              <Input inputMode="decimal" placeholder="Amount in ₹" value={amount} onChange={(e) => setAmount(e.target.value)} className="num font-semibold" />
            </label>
            <p className="text-[13px] leading-snug text-muted">
              {kind === 'fixed'
                ? `${pickedName} pays exactly ${paise ? formatRupees(paise) : 'this amount'}. Everyone else splits the rest equally.`
                : `Everyone shares ${r.ok && paise ? formatRupees(Math.max(0, r.dividablePaise - paise)) : 'the rest'} equally; ${pickedName} adds ${paise ? formatRupees(paise) : 'this amount'} on top.`}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-pays">
            {error}
          </p>
        )}
        {!unchanged && (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => {
              if (who === 'none') return onApply(clearOthers())
              if (!paise) return setError('Enter an amount like 2000')
              setError(null)
              onApply([...clearOthers(who), { memberId: who, exception: kind, exceptionPaise: paise }])
            }}
          >
            {who === 'none' ? 'Everyone pays equally' : 'Apply'}
          </Button>
        )}
      </div>
    </section>
  )
}
