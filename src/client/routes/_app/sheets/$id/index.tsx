import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { istDate, shortDate } from '../../../../../domain/hisaab.ts'
import { formatRupees, parseRupees, upiAmount } from '../../../../../domain/money.ts'
import { api, call, type SheetView } from '../../../../api.ts'
import { sheetQuery } from '../../../../queries.ts'
import { Button, ButtonLink, Card, ErrorBox, Input, Loading, Money, Page, StateTag, Tag } from '../../../../ui.tsx'
import { Categories, EXCEPTION_TAG, NetText } from '../../../../sheet-parts.tsx'

export const Route = createFileRoute('/_app/sheets/$id/')({ component: SheetPage })

function SheetPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(sheetQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Month" back><ErrorBox error={error} /></Page>
  return <Sheet s={data} />
}

function Sheet({ s }: { s: SheetView }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sheet', s.sheet.id] })
  const open = s.sheet.state === 'open'
  const active = s.me.status === 'active'
  const r = s.result
  const today = istDate(new Date())
  const canCloseToday = s.sheet.endDate === null || today >= s.sheet.endDate
  const name = (id: string | null) => (id ? (s.names[id] ?? '') : 'Outside the split')

  const statement = useMutation({ mutationFn: () => call(api.sheets[':id'].statement.$post({ param: { id: s.sheet.id } })), onSuccess: refresh })
  const revoke = useMutation({ mutationFn: (sid: string) => call(api.statements[':id'].$delete({ param: { id: sid } })), onSuccess: refresh })
  const reopen = useMutation({
    mutationFn: () => call(api.sheets[':id'].reopen.$post({ param: { id: s.sheet.id }, json: { version: s.sheet.version } })),
    onSettled: () => queryClient.invalidateQueries(),
  })

  return (
    <Page title={`${s.hisaab.name} · ${s.sheet.name}`} back>
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{open ? 'Total so far' : 'Total'}</p>
          <StateTag state={s.sheet.state} />
        </div>
        {r.ok ? (
          <>
            <Money paise={r.totalPaise} className="text-3xl font-bold" />
            <p className="text-sm text-slate-500">{s.entries.length} entries</p>
            {r.dividablePaise !== r.totalPaise && <p className="text-sm text-slate-600">Divided between members: <Money paise={r.dividablePaise} /></p>}
            <Categories categories={r.categories} />
          </>
        ) : (
          <p className="mt-1 text-sm text-red-800">{r.message}</p>
        )}
      </Card>

      {open && active && (
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink to="/hisaabs/$id/add" params={{ id: s.hisaab.id }}>
            + Add
          </ButtonLink>
          {canCloseToday ? (
            <ButtonLink to="/sheets/$id/close" params={{ id: s.sheet.id }} variant="secondary">
              Close month
            </ButtonLink>
          ) : (
            <p className="self-center text-center text-xs text-slate-500">You can close this month on {shortDate(s.sheet.endDate!)}.</p>
          )}
        </div>
      )}

      {r.ok && (
        <Card>
          <h2 className="mb-1 font-semibold">{open ? 'Shares if closed today' : 'Shares'}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {r.members.map((m) => {
              const part = s.participants.find((p) => p.memberId === m.memberId)
              const tag = part && EXCEPTION_TAG(part)
              return (
                <li key={m.memberId} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
                  <span className="font-medium">
                    {name(m.memberId)} {tag && <Tag>{tag}</Tag>}
                  </span>
                  <span className="text-right">
                    share <Money paise={m.obligationPaise} className="font-semibold" />
                  </span>
                  <span className="text-slate-500">
                    paid <Money paise={m.paidPaise} />
                  </span>
                  <span className="text-right">
                    <NetText net={m.netPaise} />
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {s.transfers.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold">Payments</h2>
          <ul className="divide-y divide-slate-100">
            {s.transfers.map((t) => (
              <Payment key={t.id} t={t} s={s} />
            ))}
          </ul>
        </Card>
      )}

      {active && (
        <Card>
          <h2 className="mb-1 font-semibold">Share</h2>
          {s.statement ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Anyone with this link can see this month's entries and amounts (no login, no UPI IDs).</p>
              <p className="break-all rounded-lg bg-slate-100 p-2 text-sm">{s.statement.link}</p>
              <div className="flex flex-wrap gap-2">
                {s.share && (
                  <a href={s.share.waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white">
                    Share on WhatsApp
                  </a>
                )}
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(s.statement!.link)}>
                  Copy link
                </Button>
                <Button variant="ghost" onClick={() => confirm('Turn off this link? People who have it will not be able to open it.') && revoke.mutate(s.statement!.id)}>
                  Turn off link
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => statement.mutate()} disabled={statement.isPending}>
              Make a statement link
            </Button>
          )}
          <ErrorBox error={statement.error ?? revoke.error} />
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-semibold">Entries</h2>
        {s.entries.length === 0 && <p className="py-2 text-sm text-slate-500">No bills yet this month. Add the first one.</p>}
        <ul className="divide-y divide-slate-100">
          {[...s.entries].reverse().map((e) => (
            <li key={e.id}>
              <Link to="/sheets/$id/entries/$entryId" params={{ id: s.sheet.id, entryId: e.id }} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">
                    {e.type === 'bill' ? e.note || e.category : e.type === 'refund' ? `Refund · ${e.note || e.category}` : `${name(e.paidByMemberId)} gave ${name(e.toMemberId)}`}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {shortDate(e.date)} · {e.type === 'bill' ? `paid by ${name(e.paidByMemberId)}` : e.type === 'refund' ? `to ${name(e.toMemberId)}` : e.note || 'Money given'}
                    {e.late && <> · <Tag tone="amber">Late: dated {shortDate(e.date)}</Tag></>}
                  </span>
                </span>
                <Money paise={e.amountPaise} className={e.type === 'refund' ? 'text-brand' : ''} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {!open && s.me.role === 'admin' && active && (
        <div className="text-center">
          <Button
            variant="ghost"
            onClick={() => confirm('Reopen this month? Payments already marked paid are kept as "Money given". Unpaid ones are removed until you close again.') && reopen.mutate()}
          >
            Reopen this month
          </Button>
          <ErrorBox error={reopen.error} />
        </div>
      )}
    </Page>
  )
}

function Payment({ t, s }: { t: SheetView['transfers'][number]; s: SheetView }) {
  const queryClient = useQueryClient()
  const [marking, setMarking] = useState(false)
  const [via, setVia] = useState<'upi_link' | 'manual'>('manual')
  const [amount, setAmount] = useState(formatRupees(t.amountPaise).replace('₹', ''))
  const [amountError, setAmountError] = useState<string | null>(null)
  const from = s.names[t.from]
  const to = s.names[t.to]
  const upi = s.upiIds[t.to]
  const iPay = t.from === s.me.memberId
  const party = (id: string) => s.participants.find((p) => p.memberId === id)
  const canMark = s.me.status === 'active' && (iPay || t.to === s.me.memberId || !party(t.from)?.hasUser || !party(t.to)?.hasUser)

  const mark = useMutation({
    mutationFn: (amountPaise: number) => call(api.transfers[':id'].paid.$post({ param: { id: t.id }, json: { amountPaise, via, version: s.sheet.version } })),
    onSuccess: () => setMarking(false),
    onSettled: () => queryClient.invalidateQueries(),
  })

  const upiLink = upi && `upi://pay?${new URLSearchParams({ pa: upi, pn: to ?? '', am: upiAmount(t.amountPaise), cu: 'INR', tn: `PaiseGuru ${s.hisaab.name}` })}`

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <span>
          {iPay ? 'You pay' : `${from} pays`} {t.to === s.me.memberId ? 'you' : to}
          {t.status === 'paid' && <> <Tag tone="brand">paid</Tag></>}
        </span>
        <Money paise={t.amountPaise} className="font-semibold" />
      </div>
      {t.status === 'unpaid' && s.me.status === 'active' && (
        <div className="flex flex-wrap gap-2">
          {iPay && upiLink && (
            <a href={upiLink} onClick={() => setVia('upi_link')} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white">
              Pay {formatRupees(t.amountPaise)} with UPI
            </a>
          )}
          {iPay && upi && (
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(`${upi} ${upiAmount(t.amountPaise)}`)}>
              Copy UPI ID + amount
            </Button>
          )}
          {iPay && !upi && <p className="text-sm text-slate-500">Ask {to} to add a UPI ID in the app.</p>}
          {canMark && !marking && (
            <Button variant="secondary" onClick={() => setMarking(true)}>
              Mark paid
            </Button>
          )}
        </div>
      )}
      {marking && t.status === 'unpaid' && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const paise = parseRupees(amount)
            if (!paise || paise > t.amountPaise) return setAmountError(`Enter up to ${formatRupees(t.amountPaise)}`)
            setAmountError(null)
            mark.mutate(paise)
          }}
        >
          <label className="flex-1">
            <span className="text-xs text-slate-600">Amount paid (less is fine; the rest stays unpaid)</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <Button type="submit" disabled={mark.isPending}>
            Save
          </Button>
        </form>
      )}
      {amountError && <p className="text-sm text-red-700">{amountError}</p>}
      <ErrorBox error={mark.error} />
    </li>
  )
}
