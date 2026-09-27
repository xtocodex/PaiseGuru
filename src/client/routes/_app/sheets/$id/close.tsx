import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatRupees, parseRupees } from '../../../../../domain/money.ts'
import { api, call, type SheetView } from '../../../../api.ts'
import { sheetQuery } from '../../../../queries.ts'
import { Categories, EXCEPTION_TAG, NetText } from '../../../../sheet-parts.tsx'
import { Button, ButtonLink, Card, ErrorBox, Input, Loading, Money, Page, Select, Tag } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/sheets/$id/close')({ component: ClosePage })

type Exception = 'none' | 'fixed' | 'extra' | 'skip'

function ClosePage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(sheetQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Close month" back><ErrorBox error={error} /></Page>
  return <Close s={data} />
}

function Close({ s }: { s: SheetView }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sheet', s.sheet.id] })
  const [editing, setEditing] = useState<string | null>(null)
  const r = s.result
  const name = (id: string) => s.names[id] ?? ''

  const setException = useMutation({
    mutationFn: (v: { memberId: string; exception: Exception; exceptionPaise: number; version: number }) =>
      call(api.sheets[':id'].participants[':mid'].$put({ param: { id: s.sheet.id, mid: v.memberId }, json: v })),
    onSettled: refresh,
  })
  const clearAll = useMutation({
    mutationFn: async () => {
      let version = s.sheet.version
      for (const p of s.participants.filter((x) => x.exception !== 'none')) {
        await call(api.sheets[':id'].participants[':mid'].$put({ param: { id: s.sheet.id, mid: p.memberId }, json: { exception: 'none', exceptionPaise: 0, version: version++ } }))
      }
    },
    onSettled: refresh,
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

  const hasExceptions = s.participants.some((p) => p.exception !== 'none')
  return (
    <Page title={`Close ${s.sheet.name}`} back>
      <Card>
        <p className="text-sm text-slate-500">
          {s.hisaab.name} · {s.entries.length} entries
        </p>
        {r.ok ? (
          <>
            <Money paise={r.dividablePaise} className="text-3xl font-bold" />
            {r.dividablePaise !== r.totalPaise && <p className="text-sm text-slate-600">Plus <Money paise={r.totalPaise - r.dividablePaise} /> outside the split</p>}
            <Categories categories={r.categories} />
          </>
        ) : (
          <p role="alert" className="mt-1 font-medium text-red-800">{r.message}</p>
        )}
      </Card>

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Each member's share</h2>
          {hasExceptions && (
            <Button variant="ghost" className="text-sm" onClick={() => clearAll.mutate()} disabled={clearAll.isPending}>
              Clear exceptions
            </Button>
          )}
        </div>
        <p className="mb-2 text-xs text-slate-500">Tap a member to change their share for this month.</p>
        <ul className="divide-y divide-slate-100">
          {s.participants.map((p) => {
            const m = r.ok ? r.members.find((x) => x.memberId === p.memberId) : null
            const tag = EXCEPTION_TAG(p)
            return (
              <li key={p.memberId}>
                <button className="flex min-h-12 w-full items-center justify-between gap-2 text-left" aria-expanded={editing === p.memberId} onClick={() => setEditing(editing === p.memberId ? null : p.memberId)}>
                  <span>
                    {p.name} {tag && <Tag tone="amber">{tag}</Tag>}
                  </span>
                  {m ? <Money paise={m.obligationPaise} className="font-semibold" /> : <span className="text-slate-400">–</span>}
                </button>
                {editing === p.memberId && (
                  <ExceptionEditor
                    p={p}
                    pending={setException.isPending}
                    onSave={(exception, exceptionPaise) =>
                      setException.mutate({ memberId: p.memberId, exception, exceptionPaise, version: s.sheet.version }, { onSuccess: () => setEditing(null) })
                    }
                  />
                )}
              </li>
            )
          })}
        </ul>
        <ErrorBox error={setException.error ?? clearAll.error} />
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
      <p className="text-center text-xs text-slate-500">After closing, entries can't change unless the admin reopens the month.</p>
    </Page>
  )
}

function ExceptionEditor({ p, pending, onSave }: { p: SheetView['participants'][number]; pending: boolean; onSave: (e: Exception, paise: number) => void }) {
  const [exception, setException] = useState<Exception>(p.exception)
  const [amount, setAmount] = useState(p.exceptionPaise ? formatRupees(p.exceptionPaise).replace('₹', '') : '')
  const [error, setError] = useState<string | null>(null)
  const needsAmount = exception === 'fixed' || exception === 'extra'
  return (
    <form
      className="mb-3 space-y-2 rounded-xl bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const paise = needsAmount ? parseRupees(amount) : 0
        if (needsAmount && !paise) return setError('Enter an amount like 8000')
        setError(null)
        onSave(exception, paise ?? 0)
      }}
    >
      <Select value={exception} onChange={(e) => setException(e.target.value as Exception)} aria-label={`${p.name}'s share`}>
        <option value="none">Shares the rest like everyone</option>
        <option value="fixed">Pays a fixed amount</option>
        <option value="extra">Pays an extra amount, then shares the rest</option>
        <option value="skip">Skips this month</option>
      </Select>
      {needsAmount && <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in ₹" aria-label="Amount" />}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        Save
      </Button>
    </form>
  )
}
