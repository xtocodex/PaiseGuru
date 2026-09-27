import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatRupees, parseRupees } from '../../../../../domain/money.ts'
import { api, call, type SheetView } from '../../../../api.ts'
import { sheetQuery } from '../../../../queries.ts'
import { Categories, NetText } from '../../../../sheet-parts.tsx'
import { Button, ButtonLink, Card, ErrorBox, Field, Input, Loading, Money, Page, Select, Tag, cx } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/sheets/$id/close')({ component: ClosePage })

type Exception = 'none' | 'fixed' | 'extra' | 'skip'
type Change = { memberId: string; exception: Exception; exceptionPaise: number }

function ClosePage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(sheetQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Close month" back><ErrorBox error={error} /></Page>
  return <Close s={data} />
}

function Close({ s }: { s: SheetView }) {
  const queryClient = useQueryClient()
  const r = s.result
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
      <Page title={`${s.sheet.name} closed`} back>
        <Card className="space-y-3 text-center">
          <p className="text-lg font-semibold">{s.sheet.name} is closed.</p>
          <p className="text-sm text-slate-600">Send everyone the result. The link shows every entry and how it was divided.</p>
          {close.data.share && (
            <a href={close.data.share.waLink} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white">
              Share on WhatsApp
            </a>
          )}
          <ButtonLink to="/sheets/$id" params={{ id: s.sheet.id }} variant="secondary" className="w-full">
            See payments
          </ButtonLink>
        </Card>
      </Page>
    )
  }

  if (s.sheet.state !== 'open') {
    return (
      <Page title="Close month" back>
        <Card>
          This month is already closed. <Link to="/sheets/$id" params={{ id: s.sheet.id }} className="text-brand underline">See it</Link>
        </Card>
      </Page>
    )
  }

  return (
    <Page title={`Close ${s.sheet.name}`} back>
      <Card>
        <p className="text-sm text-slate-500">
          {s.hisaab.name} · {s.entries.length} entries
        </p>
        {r.ok ? (
          <>
            <Money paise={r.dividablePaise} className="text-3xl font-bold" />
            <p className="text-sm text-slate-600">to divide between members</p>
            {r.dividablePaise !== r.totalPaise && (
              <p className="text-sm text-slate-600">
                Plus <Money paise={r.totalPaise - r.dividablePaise} /> {s.hisaab.forLabel ? `from ${s.hisaab.forLabel}'s money` : 'outside the split'}, not divided
              </p>
            )}
            <Categories categories={r.categories} />
          </>
        ) : (
          <p role="alert" className="mt-1 font-medium text-red-800">{r.message}</p>
        )}
      </Card>

      <PaysMore s={s} pending={apply.isPending} onApply={(changes) => apply.mutate(changes)} />

      <Card>
        <h2 className="mb-1 font-semibold">Each member's share</h2>
        <ul className="divide-y divide-slate-100">
          {s.participants.map((p) => {
            const m = r.ok ? r.members.find((x) => x.memberId === p.memberId) : null
            const skipped = p.exception === 'skip'
            return (
              <li key={p.memberId} className="flex min-h-12 items-center justify-between gap-2">
                <span className={cx(skipped && 'text-slate-400')}>
                  {p.name} {p.exception === 'fixed' && <Tag tone="amber">fixed</Tag>}
                  {p.exception === 'extra' && <Tag tone="amber">extra</Tag>}
                </span>
                <span className="flex items-center gap-2">
                  {m ? <Money paise={m.obligationPaise} className="font-semibold" /> : <span className="text-slate-400">–</span>}
                  <Button
                    variant="ghost"
                    className="px-2 text-sm"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate([{ memberId: p.memberId, exception: skipped ? 'none' : 'skip', exceptionPaise: 0 }])}
                  >
                    {skipped ? 'Include' : 'Skip'}
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-1 text-xs text-slate-500">"Skip" means that member pays nothing this month.</p>
        <ErrorBox error={apply.error} />
      </Card>

      {r.ok && (
        <Card>
          <h2 className="mb-1 font-semibold">Paid so far → result</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {r.members.map((m) => (
              <li key={m.memberId} className="flex min-h-11 items-center justify-between gap-2">
                <span>
                  {name(m.memberId)} <span className="text-slate-500">paid <Money paise={m.paidPaise} /></span>
                </span>
                <NetText net={m.netPaise} />
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            {r.transfers.length === 0
              ? 'Nothing to pay. The month will be settled right away.'
              : `${r.transfers.length} ${r.transfers.length === 1 ? 'payment clears' : 'payments clear'} the month: ${r.transfers
                  .map((t) => `${name(t.from)} → ${name(t.to)} ${formatRupees(t.amountPaise)}`)
                  .join(' · ')}`}
          </p>
        </Card>
      )}

      <ErrorBox error={close.error} />
      <Button className="w-full" disabled={!r.ok || close.isPending} onClick={() => close.mutate()}>
        Close month and share
      </Button>
      <p className="text-center text-xs text-slate-500">
        You can close before the month ends. Bills added after closing go into next month. Entries can't change unless the admin reopens the month.
      </p>
    </Page>
  )
}

/** One member pays more: a fixed total, or an extra amount on top of an equal share (S7 exceptions). */
function PaysMore({ s, pending, onApply }: { s: SheetView; pending: boolean; onApply: (changes: Change[]) => void }) {
  const current = s.participants.find((p) => p.exception === 'fixed' || p.exception === 'extra')
  const [editing, setEditing] = useState(false)
  const [memberId, setMemberId] = useState(current?.memberId ?? '')
  const [kind, setKind] = useState<'fixed' | 'extra'>(current?.exception === 'extra' ? 'extra' : 'fixed')
  const [amount, setAmount] = useState(current ? formatRupees(current.exceptionPaise).replace('₹', '') : '')
  const [error, setError] = useState<string | null>(null)
  const others = s.participants.filter((p) => p.exception !== 'skip')

  if (current && !editing) {
    return (
      <Card>
        <h2 className="mb-1 font-semibold">Someone pays more</h2>
        <p>
          {current.exception === 'fixed' ? (
            <>
              <b>{current.name}</b> pays a fixed <Money paise={current.exceptionPaise} className="font-semibold" />. The others split the rest equally.
            </>
          ) : (
            <>
              <b>{current.name}</b> pays <Money paise={current.exceptionPaise} className="font-semibold" /> extra on top of an equal share.
            </>
          )}
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Change
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => onApply([{ memberId: current.memberId, exception: 'none', exceptionPaise: 0 }])}>
            Remove
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Does someone pay more this month?</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const paise = parseRupees(amount)
          if (!memberId) return setError('Pick who pays more.')
          if (!paise) return setError('Enter an amount like 3000.')
          setError(null)
          // Only one person pays more: clear anyone else who had Fixed or Extra.
          const clear = s.participants
            .filter((p) => p.memberId !== memberId && (p.exception === 'fixed' || p.exception === 'extra'))
            .map((p) => ({ memberId: p.memberId, exception: 'none' as const, exceptionPaise: 0 }))
          onApply([...clear, { memberId, exception: kind, exceptionPaise: paise }])
          setEditing(false)
        }}
      >
        <Field label="Who">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Pick a member</option>
            {others.map((p) => (
              <option key={p.memberId} value={p.memberId}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div role="radiogroup" aria-label="How" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
          {(['fixed', 'extra'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cx('min-h-11 rounded-lg text-sm font-semibold', kind === k ? 'bg-white shadow-sm' : 'text-slate-600')}
            >
              {k === 'fixed' ? 'Fixed amount' : 'Extra on top'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {kind === 'fixed'
            ? 'They pay exactly this amount. Everyone else splits the rest equally.'
            : 'They pay an equal share like everyone, plus this amount on top.'}
        </p>
        <Field label="Amount (₹)" error={error}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            Save
          </Button>
          {current && (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
