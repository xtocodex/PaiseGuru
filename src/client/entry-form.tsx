// Add or edit a Hisaab entry (S6). Amount first; people and category are chips. The page's footer
// buttons submit this form through form="entry-form".
import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { CATEGORIES, istDate, type Category } from '../domain/hisaab.ts'
import { formatRupees, parseRupees } from '../domain/money.ts'
import { CATEGORY_ICON } from './categories.tsx'
import { Chips, ErrorBox, Field, Input, Segmented, Select, cx } from './ui.tsx'

export type EntryType = 'bill' | 'refund' | 'money_given' | 'money_in'
export type EntryValues = {
  type: EntryType
  amountPaise: number
  category: Category | null
  date: string
  note: string
  paidByMemberId: string | null
  toMemberId: string | null
}

const OUTSIDE = 'outside'
const COMMON: Category[] = ['Healthcare', 'Food', 'Groceries', 'Household help', 'Bills']

export function EntryForm(props: {
  members: { id: string; name: string }[]
  meId: string
  /** The person the Hisaab is for (e.g. Dadi): enables "Money in" and "From their money". */
  forLabel: string | null
  initial?: EntryValues
  error: unknown
  onSubmit: (v: EntryValues, again: boolean) => void
}) {
  const init = props.initial
  const today = istDate(new Date())
  const others = props.members.filter((m) => m.id !== props.meId)
  const [type, setType] = useState<EntryType>(init?.type ?? 'bill')
  const [amount, setAmount] = useState(init ? formatRupees(init.amountPaise).replace('₹', '') : '')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState<string>(init ? (init.paidByMemberId ?? OUTSIDE) : props.meId)
  const [to, setTo] = useState<string>(init?.toMemberId ?? (type === 'money_given' ? (others[0]?.id ?? props.meId) : props.meId))
  const [category, setCategory] = useState<Category>(init?.category ?? 'Healthcare')
  const [more, setMore] = useState(init?.category ? !COMMON.includes(init.category) : false)
  const [date, setDate] = useState(init?.date ?? today)
  const [note, setNote] = useState(init?.note ?? '')

  const outsideLabel = props.forLabel ? `${props.forLabel}'s money` : 'Outside the split'
  const people = props.members.map((m) => ({ value: m.id, label: m.id === props.meId ? 'You' : m.name }))
  const types = [
    { value: 'bill' as const, label: 'Bill' },
    { value: 'refund' as const, label: 'Refund' },
    { value: 'money_given' as const, label: 'Given' },
    ...(props.forLabel || type === 'money_in' ? [{ value: 'money_in' as const, label: 'Money in' }] : []),
  ]

  function changeType(t: EntryType) {
    setType(t)
    if (t === 'money_given' && to === paidBy) setTo(others[0]?.id ?? props.meId)
    if (t === 'money_given' && paidBy === OUTSIDE) setPaidBy(props.meId)
  }

  function submit(again: boolean) {
    const amountPaise = parseRupees(amount)
    if (!amountPaise) return setAmountError('Enter an amount like 250 or 250.50')
    setAmountError(null)
    props.onSubmit(
      {
        type,
        amountPaise,
        category: type === 'bill' || type === 'refund' ? category : null,
        date,
        note,
        paidByMemberId: type === 'bill' ? (paidBy === OUTSIDE ? null : paidBy) : type === 'money_given' ? paidBy : null,
        toMemberId: type === 'refund' || type === 'money_given' ? to : null,
      },
      again,
    )
  }

  return (
    <form
      id="entry-form"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'again')
      }}
    >
      <Segmented label="Type" options={types} value={type} onChange={changeType} />

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
        {amountError && (
          <p role="alert" className="text-sm text-pays">
            {amountError}
          </p>
        )}
        <input
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder={type === 'money_in' ? 'What is it? (for example, pension)' : 'What was it for?'}
          className="w-full rounded-xl bg-transparent px-3 py-2 text-center text-[15px] text-muted outline-none placeholder:text-faint focus:bg-card"
        />
      </div>

      {type === 'bill' && (
        <Field label="Paid by" group>
          <Chips label="Paid by" value={paidBy} onChange={setPaidBy} options={[...people, { value: OUTSIDE, label: outsideLabel }]} />
        </Field>
      )}
      {type === 'bill' && paidBy === OUTSIDE && (
        <p className="-mt-3 text-[13px] text-muted">Shown in the total, not divided between members.</p>
      )}
      {type === 'refund' && (
        <Field label="Received by" group>
          <Chips label="Received by" value={to} onChange={setTo} options={people} />
        </Field>
      )}
      {type === 'money_given' && (
        <>
          <Field label="From" group>
            <Chips label="From" value={paidBy} onChange={setPaidBy} options={people} />
          </Field>
          <Field label="To" group>
            <Chips label="To" value={to} onChange={setTo} options={people.filter((p) => p.value !== paidBy)} />
          </Field>
        </>
      )}
      {type === 'money_in' && (
        <p className="rounded-xl bg-card p-3 text-[13px] text-muted">
          Money {props.forLabel ?? 'the Hisaab'} receives, like a pension. It is not divided and changes nobody's share. Bills paid from it are marked "{outsideLabel}".
        </p>
      )}

      {(type === 'bill' || type === 'refund') && (
        <Field label="Category" group>
          <Chips
            label="Category"
            value={more ? null : category}
            onChange={(v) => (v === ('more' as Category) ? setMore(true) : (setCategory(v), setMore(false)))}
            options={[...COMMON.map((c) => ({ value: c, label: c === 'Household help' ? 'Help' : c, icon: CATEGORY_ICON[c] })), { value: 'more' as Category, label: 'More' }]}
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
        <span className={cx('relative flex items-center')}>
          <Calendar className="pointer-events-none absolute left-3.5 size-5 text-muted" aria-hidden />
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="pl-11" required />
        </span>
      </Field>

      <ErrorBox error={props.error} />
    </form>
  )
}
