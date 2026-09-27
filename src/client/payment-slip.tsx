// The "payment slip": one who-pays-whom transfer, with Pay (UPI), Copy and Mark paid.
import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Copy, Zap } from 'lucide-react'
import { formatRupees, parseRupees, upiAmount } from '../domain/money.ts'
import { api, call } from './api.ts'
import { Avatar, Button, ErrorBox, Field, Input, Sheet, cx } from './ui.tsx'

export type SlipTransfer = { id: string; from: string; to: string; amountPaise: number; status: 'paid' | 'unpaid' }

export function PaymentSlip(props: {
  t: SlipTransfer
  names: Record<string, string>
  meMemberId: string
  subtitle?: ReactNode
  /** Payee's UPI ID, for the Pay button (hidden when missing). */
  upiId?: string | null
  hisaabName: string
  /** Sheet version for the mark-paid request; omit to show the slip without actions. */
  version?: number
  canMark?: boolean
}) {
  const { t, names, meMemberId } = props
  const queryClient = useQueryClient()
  const [marking, setMarking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [via, setVia] = useState<'upi_link' | 'manual'>('manual')
  const iPay = t.from === meMemberId
  const iGet = t.to === meMemberId
  const from = iPay ? 'You' : names[t.from]
  const to = iGet ? 'you' : names[t.to]
  const paid = t.status === 'paid'
  const upiLink =
    props.upiId && `upi://pay?${new URLSearchParams({ pa: props.upiId, pn: names[t.to] ?? '', am: upiAmount(t.amountPaise), cu: 'INR', tn: `PaiseGuru ${props.hisaabName}` })}`

  return (
    <section className={cx('overflow-hidden rounded-2xl border border-line bg-card', paid && 'opacity-80')}>
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
        <span className="flex items-center gap-1.5" aria-hidden>
          <Avatar name={names[t.from] ?? '?'} id={t.from} size={34} />
          <ArrowRight className="size-4 text-faint" />
          <Avatar name={names[t.to] ?? '?'} id={t.to} size={34} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[15px] leading-snug font-semibold">
            {from} {paid ? 'paid' : iPay ? 'pay' : 'pays'} {to}
          </span>
          {props.subtitle && <span className="block truncate text-[13px] text-muted">{props.subtitle}</span>}
        </span>
        <span className={cx('num shrink-0 text-xl font-bold', paid ? 'text-muted line-through decoration-2' : iPay ? 'text-pays' : iGet ? 'text-gets' : '')}>
          {formatRupees(t.amountPaise)}
        </span>
      </div>
      {!paid && props.version !== undefined && (iPay || props.canMark) && (
        <>
          <div className="relative mx-3.5 border-t-2 border-dashed border-line" aria-hidden>
            <span className="absolute -top-[9px] -left-[23px] size-4 rounded-full border border-line bg-paper" />
            <span className="absolute -top-[9px] -right-[23px] size-4 rounded-full border border-line bg-paper" />
          </div>
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-3.5">
            {iPay && props.upiId && (
              <Button
                size="sm"
                variant="secondary"
                icon={copied ? Check : Copy}
                onClick={() => navigator.clipboard.writeText(`${props.upiId} ${upiAmount(t.amountPaise)}`).then(() => setCopied(true))}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
            {iPay && !props.upiId && <span className="flex-1 text-[13px] text-muted">Ask {names[t.to]} to add a UPI ID</span>}
            {props.canMark !== false && (
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setMarking(true)}>
                Mark paid
              </Button>
            )}
            {iPay && upiLink && (
              <a href={upiLink} onClick={() => setVia('upi_link')} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gets px-3.5 text-sm font-semibold text-on-gets">
                <Zap className="size-4" aria-hidden />
                Pay
              </a>
            )}
          </div>
        </>
      )}
      {marking && props.version !== undefined && (
        <MarkPaidSheet
          t={t}
          label={`${from} ${iPay ? 'pay' : 'pays'} ${to}`}
          version={props.version}
          via={via}
          onClose={() => setMarking(false)}
          onDone={() => {
            setMarking(false)
            queryClient.invalidateQueries()
          }}
        />
      )}
    </section>
  )
}

function MarkPaidSheet({ t, label, version, via, onClose, onDone }: { t: SlipTransfer; label: string; version: number; via: 'upi_link' | 'manual'; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(formatRupees(t.amountPaise).replace('₹', ''))
  const [error, setError] = useState<string | null>(null)
  const mark = useMutation({
    mutationFn: (amountPaise: number) => call(api.transfers[':id'].paid.$post({ param: { id: t.id }, json: { amountPaise, via, version } })),
    onSuccess: onDone,
    onError: () => queryClient.invalidateQueries(),
  })
  return (
    <Sheet open onClose={onClose} title="Mark as paid">
      <p className="text-sm text-muted">{label}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const paise = parseRupees(amount)
          if (!paise || paise > t.amountPaise) return setError(`Enter up to ${formatRupees(t.amountPaise)}`)
          setError(null)
          mark.mutate(paise)
        }}
      >
        <Field label="Amount paid (₹)" hint="Paid less? Enter what was paid; the rest stays to pay." error={error}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" />
        </Field>
        <ErrorBox error={mark.error} />
        <Button type="submit" disabled={mark.isPending} icon={Check}>
          Mark paid
        </Button>
      </form>
    </Sheet>
  )
}
