// Add or edit an expense. Amount first, then one sentence: "Paid by [you] · split [equally]", each part a
// tappable sheet. The split preview uses the same buildShares() as the server. The page's footer buttons
// submit this form through form="expense-form".
import { useState } from 'react'
import { Calendar, Check } from 'lucide-react'
import { CATEGORIES, PERCENT_TOTAL, buildShares, istDate, type Category, type SplitInput, type SplitMode } from '../domain/group.ts'
import { formatRupees, parseRupees } from '../domain/money.ts'
import type { ExpenseView } from './api.ts'
import { CATEGORY_ICON } from './categories.tsx'
import { Avatar, Button, Chips, ErrorBox, Field, Input, Segmented, Select, Sheet, cx } from './ui.tsx'

type Kind = 'expense' | 'refund' | 'fund_in'
type Mode = SplitMode | 'sheet'
export type ExpenseValues = {
  kind: Kind
  amountPaise: number
  category: Category | null
  date: string
  note: string
  fundId: string | null
  payers: { memberId: string; paidPaise: number }[]
  splitMode: Mode | 'none'
  split: SplitInput[]
}
type Member = { id: string; name: string; defaultWeight: number }
type Adjust = { exception: 'none' | 'fixed' | 'extra'; text: string }

const COMMON: Category[] = ['Food', 'Groceries', 'Transport', 'Bills', 'Shopping']
const FUND = 'fund:'
const MODE_LABEL: Record<Mode, string> = { sheet: 'at month end', equal: 'equally', exact: 'by amounts', shares: 'by shares', percent: 'by %', adjust: 'with changes' }

const rupeeText = (paise: number) => formatRupees(paise).replace('₹', '').replaceAll(',', '')
const shareText = (weight: number) => String(weight / 100)
const parseWeight = (t: string) => {
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

/** Even percents that add up to exactly 100 (the first people take the leftover hundredths). */
function evenPercents(ids: string[]) {
  const base = Math.floor(PERCENT_TOTAL / ids.length)
  let left = PERCENT_TOTAL - base * ids.length
  return Object.fromEntries(ids.map((id) => [id, String((base + (left-- > 0 ? 1 : 0)) / 100)]))
}

export function ExpenseForm(props: {
  members: Member[]
  meId: string
  funds: { id: string; name: string }[]
  monthly: boolean
  initial?: ExpenseView
  error: unknown
  onSubmit: (v: ExpenseValues, again: boolean) => void
}) {
  const { members, meId, monthly } = props
  const init = props.initial
  const today = istDate(new Date())
  const name = (id: string) => (id === meId ? 'You' : (members.find((m) => m.id === id)?.name ?? ''))
  const everyone = members.map((m) => m.id)
  const initMode: Mode = init && init.splitMode !== 'none' ? (init.splitMode as Mode) : monthly ? 'sheet' : 'equal'
  const byShare = (f: (s: ExpenseView['shares'][number]) => string) => Object.fromEntries((init?.shares ?? []).map((s) => [s.memberId, f(s)]))

  const [kind, setKind] = useState<Kind>(init?.kind === 'sheet_close' ? 'expense' : ((init?.kind as Kind) ?? 'expense'))
  const [amount, setAmount] = useState(init ? rupeeText(init.amountPaise) : '')
  const [payer, setPayer] = useState(init?.fundId ? `${FUND}${init.fundId}` : (init?.payers[0]?.memberId ?? meId))
  const [multi, setMulti] = useState<Record<string, string> | null>(
    init && init.payers.length > 1 ? Object.fromEntries(init.payers.map((p) => [p.memberId, rupeeText(p.paidPaise)])) : null,
  )
  const [mode, setMode] = useState<Mode>(initMode)
  const [included, setIncluded] = useState<string[]>(init?.shares.length ? init.shares.map((s) => s.memberId) : everyone)
  const [exact, setExact] = useState<Record<string, string>>(init?.splitMode === 'exact' ? byShare((s) => rupeeText(s.exceptionPaise)) : {})
  const [shares, setShares] = useState<Record<string, string>>(
    init?.splitMode === 'shares' ? byShare((s) => shareText(s.weight)) : Object.fromEntries(members.map((m) => [m.id, shareText(m.defaultWeight)])),
  )
  const [percent, setPercent] = useState<Record<string, string>>(init?.splitMode === 'percent' ? byShare((s) => String(s.weight / 100)) : evenPercents(everyone))
  const [adjust, setAdjust] = useState<Record<string, Adjust>>(
    init?.splitMode === 'adjust'
      ? Object.fromEntries(init.shares.map((s) => [s.memberId, { exception: s.exception, text: s.exception === 'none' ? '' : rupeeText(s.exceptionPaise) }]))
      : {},
  )
  const [category, setCategory] = useState<Category>((init?.category as Category) ?? 'Food')
  const [more, setMore] = useState(init?.category ? !COMMON.includes(init.category as Category) : false)
  const [date, setDate] = useState(init?.date ?? today)
  const [note, setNote] = useState(init?.note ?? '')
  const [open, setOpen] = useState<'payer' | 'split' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const amountPaise = parseRupees(amount) ?? 0
  const fromFund = payer.startsWith(FUND) && kind === 'expense'
  const fundId = kind === 'fund_in' ? (payer.startsWith(FUND) ? payer.slice(FUND.length) : (props.funds[0]?.id ?? null)) : fromFund ? payer.slice(FUND.length) : null

  const payers = (): ExpenseValues['payers'] => {
    if (kind === 'fund_in' || fromFund) return []
    if (multi) return Object.entries(multi).map(([memberId, t]) => ({ memberId, paidPaise: parseRupees(t) ?? 0 })).filter((p) => p.paidPaise > 0)
    return [{ memberId: payer, paidPaise: amountPaise }]
  }
  const splitRows = (): SplitInput[] => {
    if (mode === 'sheet') return []
    return included.map((memberId) => {
      if (mode === 'exact') return { memberId, exceptionPaise: parseRupees(exact[memberId] ?? '') ?? 0 }
      if (mode === 'shares') return { memberId, weight: parseWeight(shares[memberId] ?? '') }
      if (mode === 'percent') return { memberId, weight: parseWeight(percent[memberId] ?? '') }
      if (mode === 'adjust') {
        const a = adjust[memberId]
        return a && a.exception !== 'none' ? { memberId, exception: a.exception, exceptionPaise: parseRupees(a.text) ?? 0 } : { memberId }
      }
      return { memberId }
    })
  }
  const seq = (id: string) => everyone.indexOf(id)
  const preview = mode === 'sheet' || !amountPaise ? null : buildShares({ mode, amountPaise, people: splitRows(), seqOf: seq, payers: payers() })
  const myOwed = preview?.ok ? (preview.shares.find((s) => s.memberId === meId)?.owedPaise ?? 0) : null

  function submit(again: boolean) {
    if (!amountPaise) return setFormError('Enter an amount like 250 or 250.50')
    const ps = payers()
    if (kind !== 'fund_in' && !fromFund && ps.reduce((s, p) => s + p.paidPaise, 0) !== amountPaise) {
      return setFormError(`What each person paid adds up to ${formatRupees(ps.reduce((s, p) => s + p.paidPaise, 0))}, not ${formatRupees(amountPaise)}.`)
    }
    if (preview && !preview.ok) return setFormError(preview.message)
    if (kind === 'fund_in' && !fundId) return setFormError('Add a fund first, in the group settings.')
    setFormError(null)
    const noSplit = kind === 'fund_in' || fromFund
    props.onSubmit(
      {
        kind,
        amountPaise,
        category: kind === 'fund_in' ? null : category,
        date,
        note,
        fundId,
        payers: ps,
        splitMode: noSplit ? 'none' : mode,
        split: noSplit ? [] : splitRows(),
      },
      again,
    )
  }

  const payerLabel = fromFund
    ? `from ${props.funds.find((f) => `${FUND}${f.id}` === payer)?.name}`
    : multi
      ? `${Object.values(multi).filter((t) => parseRupees(t)).length} people`
      : name(payer)
  const splitLabel = mode === 'equal' && included.length !== everyone.length ? `equally, ${included.length} people` : MODE_LABEL[mode]
  const kinds = [
    { value: 'expense' as const, label: 'Expense' },
    { value: 'refund' as const, label: 'Refund' },
    ...(props.funds.length || kind === 'fund_in' ? [{ value: 'fund_in' as const, label: 'Money in' }] : []),
  ]

  return (
    <form
      id="expense-form"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'again')
      }}
    >
      {kinds.length > 1 && <Segmented label="Type" options={kinds} value={kind} onChange={(k) => {
            setKind(k)
            if (k === 'refund' && payer.startsWith(FUND)) setPayer(meId) // refunds go back to a person
          }} />}

      <div className="flex flex-col items-center gap-1">
        <label className="flex items-baseline justify-center gap-1" aria-label="Amount in rupees">
          <span className="text-3xl font-semibold text-muted">₹</span>
          <input
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            autoFocus={!init}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: `${Math.max(amount.length, 1) + 0.6}ch` }}
            className="num max-w-65 min-w-[2ch] bg-transparent text-left text-[44px] font-bold tracking-tight outline-none placeholder:text-field"
          />
        </label>
        <input
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder={kind === 'fund_in' ? 'What is it? (for example, pension)' : 'What was it for?'}
          className="w-full rounded-xl bg-transparent px-3 py-2 text-center text-[15px] text-muted outline-none placeholder:text-faint focus:bg-card"
        />
      </div>

      {kind === 'fund_in' ? (
        <Field label="Money into" group>
          <Chips label="Money into" value={fundId} onChange={(v) => setPayer(`${FUND}${v}`)} options={props.funds.map((f) => ({ value: f.id, label: f.name }))} />
          <p className="text-[13px] text-muted">Not divided and changes nobody's balance. Bills paid from it show here too.</p>
        </Field>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[15px]">
          <span className="text-muted">{kind === 'refund' ? 'Got back by' : 'Paid by'}</span>
          <PillButton onClick={() => setOpen('payer')}>{payerLabel}</PillButton>
          {!fromFund && (
            <>
              <span className="text-muted">· split</span>
              <PillButton onClick={() => setOpen('split')}>{splitLabel}</PillButton>
            </>
          )}
        </div>
      )}
      {!fromFund && kind !== 'fund_in' && (
        <p className="-mt-3 text-center text-[13px] text-muted">
          {mode === 'sheet'
            ? 'Divided between everyone when the month is closed.'
            : preview && !preview.ok
              ? preview.message
              : myOwed !== null && included.includes(meId)
                ? `Your share ${formatRupees(myOwed)}`
                : amountPaise
                  ? "You're not in this split."
                  : ''}
        </p>
      )}
      {fromFund && <p className="-mt-3 text-center text-[13px] text-muted">Paid from the fund. Not divided.</p>}

      {kind !== 'fund_in' && (
        <Field label="Category" group>
          <Chips
            label="Category"
            value={more ? null : category}
            onChange={(v) => (v === ('more' as Category) ? setMore(true) : (setCategory(v), setMore(false)))}
            options={[...COMMON.map((c) => ({ value: c, label: c, icon: CATEGORY_ICON[c] })), { value: 'more' as Category, label: 'More' }]}
          />
          {more && (
            <Select aria-label="All categories" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field label="Date">
        <span className="relative flex items-center">
          <Calendar className="pointer-events-none absolute left-3.5 size-5 text-muted" aria-hidden />
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="pl-11" required />
        </span>
      </Field>

      {formError && (
        <p role="alert" className="rounded-xl bg-pays-soft p-3 text-sm text-pays">
          {formError}
        </p>
      )}
      <ErrorBox error={props.error} />

      <Sheet open={open === 'payer'} onClose={() => setOpen(null)} title={kind === 'refund' ? 'Who got the money back?' : 'Who paid?'}>
        {!multi ? (
          <>
            <Chips
              label="Who paid"
              value={payer}
              onChange={(v) => (setPayer(v), setOpen(null))}
              options={[
                ...members.map((m) => ({ value: m.id, label: name(m.id) })),
                ...(kind === 'expense' ? props.funds.map((f) => ({ value: `${FUND}${f.id}`, label: `From ${f.name}` })) : []),
              ]}
            />
            <Button variant="ghost" onClick={() => setMulti(Object.fromEntries(members.map((m) => [m.id, m.id === payer ? amount : ''])))}>
              More than one person paid
            </Button>
          </>
        ) : (
          <>
            {members.map((m) => (
              <AmountRow key={m.id} label={name(m.id)} id={m.id} value={multi[m.id] ?? ''} onChange={(t) => setMulti({ ...multi, [m.id]: t })} />
            ))}
            <p className="text-[13px] text-muted">
              {formatRupees(Object.values(multi).reduce((s, t) => s + (parseRupees(t) ?? 0), 0))} of {formatRupees(amountPaise)}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setMulti(null)}>
                One person
              </Button>
              <Button className="flex-1" icon={Check} onClick={() => setOpen(null)}>
                Done
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={open === 'split'} onClose={() => setOpen(null)} title="Split">
        {monthly && (
          <Segmented
            label="When"
            value={mode === 'sheet' ? 'sheet' : 'now'}
            onChange={(v) => setMode(v === 'sheet' ? 'sheet' : 'equal')}
            options={[
              { value: 'sheet', label: 'At month end' },
              { value: 'now', label: 'Split now' },
            ]}
          />
        )}
        {mode === 'sheet' ? (
          <p className="text-sm text-muted">Everyone shares it when the month is closed. Fixed amounts, extras and skips are set then.</p>
        ) : (
          <>
            <Segmented
              label="How"
              value={mode}
              onChange={(m) => (setMode(m), m === 'percent' && setPercent(evenPercents(included)))}
              options={[
                { value: 'equal', label: '=' },
                { value: 'exact', label: '₹' },
                { value: 'shares', label: 'Shares' },
                { value: 'percent', label: '%' },
                { value: 'adjust', label: '±' },
              ]}
            />
            <p className="-mt-2 text-[13px] text-muted">
              {
                {
                  equal: 'Tick who shares it. Everyone ticked pays the same.',
                  exact: 'Type what each person owes. It must add up to the total.',
                  shares: 'A couple can be 2 shares, a child 0.5.',
                  percent: 'Percents must add up to 100.',
                  adjust: 'Someone pays a fixed amount or extra; the rest is split equally.',
                }[mode]
              }
            </p>
            <div className="flex flex-col divide-y divide-line">
              {members.map((m) => {
                const on = included.includes(m.id)
                const owed = preview?.ok ? preview.shares.find((s) => s.memberId === m.id)?.owedPaise : undefined
                return (
                  <div key={m.id} className="flex min-h-14 items-center gap-3 py-1.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`Include ${m.name}`}
                      onClick={() => setIncluded(on ? included.filter((x) => x !== m.id) : everyone.filter((x) => x === m.id || included.includes(x)))}
                      className={cx('press grid size-7 shrink-0 place-items-center rounded-lg border-2', on ? 'border-brand bg-brand text-on-brand' : 'border-field')}
                    >
                      {on && <Check className="size-4" aria-hidden />}
                    </button>
                    <Avatar name={m.name} id={m.id} size={32} muted={!on} />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{name(m.id)}</span>
                    {on && mode === 'exact' && <SmallInput label={`${m.name} owes`} value={exact[m.id] ?? ''} onChange={(t) => setExact({ ...exact, [m.id]: t })} prefix="₹" />}
                    {on && mode === 'shares' && <SmallInput label={`${m.name} shares`} value={shares[m.id] ?? '1'} onChange={(t) => setShares({ ...shares, [m.id]: t })} />}
                    {on && mode === 'percent' && <SmallInput label={`${m.name} percent`} value={percent[m.id] ?? ''} onChange={(t) => setPercent({ ...percent, [m.id]: t })} suffix="%" />}
                    {on && mode === 'adjust' && (
                      <span className="flex items-center gap-1">
                        <select
                          aria-label={`${m.name} pays`}
                          value={adjust[m.id]?.exception ?? 'none'}
                          onChange={(e) => setAdjust({ ...adjust, [m.id]: { exception: e.target.value as Adjust['exception'], text: adjust[m.id]?.text ?? '' } })}
                          className="h-10 rounded-lg border border-field bg-card px-1.5 text-sm"
                        >
                          <option value="none">Equal</option>
                          <option value="fixed">Fixed</option>
                          <option value="extra">Extra</option>
                        </select>
                        {adjust[m.id] && adjust[m.id]!.exception !== 'none' && (
                          <SmallInput label={`${m.name} amount`} value={adjust[m.id]!.text} onChange={(t) => setAdjust({ ...adjust, [m.id]: { ...adjust[m.id]!, text: t } })} prefix="₹" />
                        )}
                      </span>
                    )}
                    {on && owed !== undefined && mode !== 'exact' && <span className="num w-20 shrink-0 text-right text-sm text-muted">{formatRupees(owed)}</span>}
                  </div>
                )
              })}
            </div>
            {preview && !preview.ok && (
              <p role="alert" className="text-sm text-pays">
                {preview.message}
              </p>
            )}
          </>
        )}
        <Button icon={Check} onClick={() => setOpen(null)}>
          Done
        </Button>
      </Sheet>
    </form>
  )
}

function PillButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="press inline-flex h-10 items-center rounded-full border border-brand-text/30 bg-brand-soft px-4 font-semibold text-brand-text">
      {children}
    </button>
  )
}

function SmallInput({ label, value, onChange, prefix, suffix }: { label: string; value: string; onChange: (t: string) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="flex h-10 w-24 shrink-0 items-center gap-0.5 rounded-lg border border-field bg-card px-2 focus-within:border-brand-text">
      <span className="sr-only">{label}</span>
      {prefix && <span className="text-sm text-muted">{prefix}</span>}
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="num w-full min-w-0 bg-transparent text-right text-[15px] outline-none" />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </label>
  )
}

function AmountRow({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (t: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={label} id={id} size={32} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <SmallInput label={`${label} paid`} value={value} onChange={onChange} prefix="₹" />
    </div>
  )
}
