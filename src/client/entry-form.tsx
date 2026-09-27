import { useState } from 'react'
import { CATEGORIES, istDate } from '../domain/hisaab.ts'
import { formatRupees, parseRupees } from '../domain/money.ts'
import { Button, ErrorBox, Field, Input, Select, cx } from './ui.tsx'

export type EntryType = 'bill' | 'refund' | 'money_given'
export type EntryValues = {
  type: EntryType
  amountPaise: number
  category: (typeof CATEGORIES)[number] | null
  date: string
  note: string
  paidByMemberId: string | null
  toMemberId: string | null
}

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'bill', label: 'Bill' },
  { value: 'refund', label: 'Refund' },
  { value: 'money_given', label: 'Money given' },
]
const OUTSIDE = 'outside'

/** Add or edit a Hisaab entry (S6). Amount is typed in rupees and parsed to paise without floats. */
export function EntryForm(props: {
  members: { id: string; name: string }[]
  meId: string
  initial?: EntryValues
  submitLabel: string
  pending: boolean
  error: unknown
  onSubmit: (v: EntryValues, again: boolean) => void
}) {
  const init = props.initial
  const [type, setType] = useState<EntryType>(init?.type ?? 'bill')
  const [amountError, setAmountError] = useState<string | null>(null)
  const today = istDate(new Date())

  function submit(form: FormData, again: boolean) {
    const amountPaise = parseRupees(String(form.get('amount')))
    if (!amountPaise) return setAmountError('Enter an amount like 250 or 250.50')
    setAmountError(null)
    const from = String(form.get('from') ?? '')
    const to = String(form.get('to') ?? '')
    props.onSubmit(
      {
        type,
        amountPaise,
        category: type === 'money_given' ? null : (String(form.get('category')) as EntryValues['category']),
        date: String(form.get('date')),
        note: String(form.get('note') ?? ''),
        paidByMemberId: type === 'refund' || from === OUTSIDE ? null : from,
        toMemberId: type === 'bill' ? null : to,
      },
      again,
    )
  }

  const people = props.members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.id === props.meId ? `${m.name} (you)` : m.name}
    </option>
  ))

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const again = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'again'
        submit(new FormData(e.currentTarget), again)
      }}
    >
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => setType(t.value)}
            className={cx('min-h-11 rounded-lg text-sm font-semibold', type === t.value ? 'bg-white shadow-sm' : 'text-slate-600')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Field label="Amount (₹)" error={amountError}>
        <Input
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={init ? formatRupees(init.amountPaise).replace('₹', '') : ''}
          placeholder="0"
          className="text-2xl font-semibold"
        />
      </Field>

      {type === 'bill' && (
        <Field label="Paid by" hint="“Outside the split” shows in the total but is not divided (for example, paid from Dadi's own money).">
          <Select name="from" defaultValue={init ? (init.paidByMemberId ?? OUTSIDE) : props.meId}>
            {people}
            <option value={OUTSIDE}>Outside the split</option>
          </Select>
        </Field>
      )}
      {type === 'refund' && (
        <Field label="Received by">
          <Select name="to" defaultValue={init?.toMemberId ?? props.meId}>
            {people}
          </Select>
        </Field>
      )}
      {type === 'money_given' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Select name="from" defaultValue={init?.paidByMemberId ?? props.meId}>
              {people}
            </Select>
          </Field>
          <Field label="To">
            <Select name="to" defaultValue={init?.toMemberId ?? props.members.find((m) => m.id !== props.meId)?.id}>
              {people}
            </Select>
          </Field>
        </div>
      )}

      {type !== 'money_given' && (
        <Field label="Category">
          <Select name="category" defaultValue={init?.category ?? 'Healthcare'}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Date">
        <Input name="date" type="date" required max={today} defaultValue={init?.date ?? today} />
      </Field>
      <Field label="Note (optional)">
        <Input name="note" maxLength={500} defaultValue={init?.note} placeholder="For example: medicines" />
      </Field>

      <ErrorBox error={props.error} />
      <Button type="submit" className="w-full" disabled={props.pending}>
        {props.submitLabel}
      </Button>
      {!init && (
        <Button type="submit" value="again" variant="secondary" className="w-full" disabled={props.pending}>
          Save and add another
        </Button>
      )}
    </form>
  )
}
