// The "payment slip": one suggested who-pays-whom, with Pay (UPI link, per app on iPhone), QR, Copy and
// Mark as sent. The app never sees UPI, so a payment is recorded by a tap: Sent counts at once, and the
// receiver confirms it (Got it) or removes it (Not received).
import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { ArrowRight, Check, Copy, MessageCircle, QrCode, Send, X, Zap } from 'lucide-react'
import { remindText } from '../domain/group.ts'
import { formatRupees, parseRupees, upiAmount } from '../domain/money.ts'
import { api, call } from './api.ts'
import { Avatar, Button, ErrorBox, Field, Input, Segmented, Sheet, askConfirm, cx, haptic, toast } from './ui.tsx'

export type Suggestion = { from: string; to: string; amountPaise: number }

const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
// iPhone has no app picker for upi://, so each app gets its own button.
const IOS_APPS = [
  { label: 'GPay', scheme: 'tez://upi/pay' },
  { label: 'PhonePe', scheme: 'phonepe://pay' },
  { label: 'Paytm', scheme: 'paytmmp://pay' },
]

const upiQuery = (upiId: string, name: string, amountPaise: number, groupName: string) =>
  new URLSearchParams({ pa: upiId, pn: name, am: upiAmount(amountPaise), cu: 'INR', tn: `PaiseGuru ${groupName}`.slice(0, 50) }).toString()

export function PaymentSlip(props: {
  t: Suggestion
  names: Record<string, string>
  meMemberId: string
  groupId: string
  groupName: string
  /** Payee's UPI ID, for Pay, QR and Copy (hidden when missing). */
  upiId?: string | null
  subtitle?: ReactNode
  /** The viewer may record this payment (a party, or acting for a placeholder). */
  canRecord: boolean
}) {
  const { t, names, meMemberId } = props
  const [recording, setRecording] = useState(false)
  const [qr, setQr] = useState(false)
  const [copied, setCopied] = useState(false)
  const iPay = t.from === meMemberId
  const iGet = t.to === meMemberId
  const from = iPay ? 'You' : names[t.from]
  const to = iGet ? 'you' : names[t.to]
  const query = props.upiId ? upiQuery(props.upiId, names[t.to] ?? '', t.amountPaise, props.groupName) : null
  const remind = `https://wa.me/?text=${encodeURIComponent(remindText({ groupName: props.groupName, fromName: names[t.from] ?? '', toName: names[t.to] ?? '', amountPaise: t.amountPaise, upiId: props.upiId ?? null, link: location.origin }))}`

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex shrink-0 items-center gap-1" aria-hidden>
            <Avatar name={names[t.from] ?? '?'} me={iPay} size={32} />
            <ArrowRight className="size-4 text-faint" />
            <Avatar name={names[t.to] ?? '?'} me={iGet} size={32} />
          </span>
          <span className={cx('num text-heading font-bold', iPay ? 'text-pays' : iGet ? 'text-gets' : '')}>{formatRupees(t.amountPaise)}</span>
        </div>
        <div>
          <p className="text-title font-semibold">
            {from} {iPay ? 'pay' : 'pays'} {to}
          </p>
          {props.subtitle && <p className="text-caption text-muted">{props.subtitle}</p>}
        </div>
      </div>
      {(props.canRecord || iGet) && (
        <>
          <div className="relative mx-3.5 border-t-2 border-dashed border-line" aria-hidden>
            <span className="absolute -top-[9px] -left-[23px] size-4 rounded-full border border-line bg-paper" />
            <span className="absolute -top-[9px] -right-[23px] size-4 rounded-full border border-line bg-paper" />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5 pb-3.5">
            {iPay && query && !IOS && (
              <a href={`upi://pay?${query}`} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gets px-3.5 text-body font-semibold text-on-gets">
                <Zap className="size-4" aria-hidden />
                Pay
              </a>
            )}
            {iPay &&
              query &&
              IOS &&
              IOS_APPS.map((a) => (
                <a key={a.label} href={`${a.scheme}?${query}`} className="press inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-gets px-2 text-body font-semibold text-on-gets">
                  {a.label}
                </a>
              ))}
            {iPay && query && (
              <>
                <Button size="sm" variant="secondary" icon={QrCode} aria-label="Show UPI QR code" onClick={() => setQr(true)}>
                  QR
                </Button>
                <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={() => navigator.clipboard.writeText(`${props.upiId} ${upiAmount(t.amountPaise)}`).then(() => setCopied(true))}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </>
            )}
            {iPay && !props.upiId && <span className="w-full text-caption text-muted">{names[t.to]} has no UPI ID in PaiseGuru yet. Pay the way you usually do, then mark it as sent.</span>}
            {iGet && (
              <a href={remind} target="_blank" rel="noreferrer" className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line px-3.5 text-body font-semibold text-brand-text">
                <MessageCircle className="size-4" aria-hidden />
                Remind
              </a>
            )}
            {props.canRecord && (
              // Your own move is the main button, unless a Pay button already is; recording for others is secondary.
              <Button size="sm" variant={(iPay && query) || (!iPay && !iGet) ? 'secondary' : 'primary'} icon={Send} className="flex-1" onClick={() => setRecording(true)}>
                {iPay ? 'Mark as sent' : iGet ? 'I got it' : 'Record payment'}
              </Button>
            )}
          </div>
        </>
      )}
      {qr && query && <QrSheet link={`upi://pay?${query}`} upiId={props.upiId!} amountPaise={t.amountPaise} onClose={() => setQr(false)} />}
      {recording && <RecordSheet t={t} label={`${from} ${iPay ? 'pay' : 'pays'} ${to}`} note={(paise) => (iPay ? `${formatRupees(paise)} to ${names[t.to]} marked as sent` : iGet ? `${formatRupees(paise)} from ${names[t.from]} recorded` : `${names[t.from]} → ${names[t.to]}: ${formatRupees(paise)} recorded`)} groupId={props.groupId} onClose={() => setRecording(false)} />}
    </section>
  )
}

/** A QR of the UPI link: scan it with another phone, or save it and scan from the gallery. */
function QrSheet({ link, upiId, amountPaise, onClose }: { link: string; upiId: string; amountPaise: number; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 280 }).then(setSrc)
  }, [link])
  return (
    <Sheet open onClose={onClose} title="Scan to pay">
      <div className="flex flex-col items-center gap-3">
        {src ? <img src={src} alt={`UPI QR code to pay ${formatRupees(amountPaise)} to ${upiId}`} className="size-64 rounded-xl bg-white p-2" /> : <div className="size-64 animate-pulse rounded-xl bg-line" />}
        <p className="num text-title font-semibold">{formatRupees(amountPaise)}</p>
        <p className="text-body text-muted">{upiId}</p>
        {src && (
          <a href={src} download="paiseguru-upi.png" className="press inline-flex h-10 items-center rounded-xl border border-line px-4 text-body font-semibold text-brand-text">
            Save QR image
          </a>
        )}
      </div>
    </Sheet>
  )
}

function RecordSheet({ t, label, note, groupId, onClose }: { t: Suggestion; label: string; note: (paise: number) => string; groupId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [id] = useState(() => crypto.randomUUID()) // one id per sheet: a double tap records once
  const [amount, setAmount] = useState(formatRupees(t.amountPaise).replace('₹', '').replaceAll(',', ''))
  const [via, setVia] = useState<'upi' | 'cash' | 'other'>('upi')
  const [utr, setUtr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const record = useMutation({
    mutationFn: (amountPaise: number) =>
      call(api.groups[':id'].payments.$post({ param: { id: groupId }, json: { id, fromMemberId: t.from, toMemberId: t.to, amountPaise, via, utr: utr.trim() || undefined } })),
    onSuccess: (_, amountPaise) => {
      queryClient.invalidateQueries()
      onClose()
      haptic()
      toast(note(amountPaise), {
        label: 'Undo',
        run: () => call(api.payments[':id'].$delete({ param: { id } })).then(() => queryClient.invalidateQueries()),
      })
    },
  })
  return (
    <Sheet open onClose={onClose} title="Record a payment">
      <p className="text-body text-muted">{label}. It counts now; the person who got it can confirm it.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const paise = parseRupees(amount)
          if (!paise) return setError('Enter an amount like 500')
          setError(null)
          record.mutate(paise)
        }}
      >
        <Field label="Amount (₹)" hint="Paid less? Enter what was paid; the rest stays to pay." error={error}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-title font-semibold" />
        </Field>
        <Segmented
          label="Paid with"
          value={via}
          onChange={setVia}
          options={[
            { value: 'upi', label: 'UPI' },
            { value: 'cash', label: 'Cash' },
            { value: 'other', label: 'Other' },
          ]}
        />
        {via === 'upi' && (
          <Field label="UPI reference (optional)" hint="The 12-digit UTR from the payment receipt helps if there is a doubt later.">
            <Input inputMode="numeric" value={utr} onChange={(e) => setUtr(e.target.value)} maxLength={40} autoComplete="off" />
          </Field>
        )}
        <ErrorBox error={record.error} />
        <Button type="submit" disabled={record.isPending} icon={Check}>
          Record payment
        </Button>
      </form>
    </Sheet>
  )
}

/** A payment someone says they sent to the viewer: Got it, or Not received (which puts the balance back). */
export function ConfirmSlip(props: { p: { id: string; fromName: string; amountPaise: number; via: string; utr: string | null }; subtitle?: ReactNode }) {
  const queryClient = useQueryClient()
  const done = (note: string) => () => {
    queryClient.invalidateQueries()
    haptic()
    toast(note)
  }
  const confirm_ = useMutation({ mutationFn: () => call(api.payments[':id'].confirm.$post({ param: { id: props.p.id } })), onSuccess: done(`${formatRupees(props.p.amountPaise)} from ${props.p.fromName} confirmed`) })
  const reject = useMutation({ mutationFn: () => call(api.payments[':id'].$delete({ param: { id: props.p.id } })), onSuccess: done('Marked as not received. The balance is back.') })
  const { p } = props
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <p className="text-body font-semibold">
        {p.fromName} says they paid you <span className="num">{formatRupees(p.amountPaise)}</span>
      </p>
      <p className="text-caption text-muted">
        {[props.subtitle, { upi: 'UPI', cash: 'Cash', other: 'Other' }[p.via], p.utr && `Ref ${p.utr}`].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-3 flex gap-3">
        <Button size="sm" variant="secondary" icon={X} disabled={reject.isPending} onClick={async () => (await askConfirm({ title: 'Not received?', text: `The ${formatRupees(p.amountPaise)} goes back to what ${p.fromName} owes.`, confirm: 'Not received', danger: true })) && reject.mutate()}>
          Not received
        </Button>
        <Button size="sm" className="flex-1" icon={Check} disabled={confirm_.isPending} onClick={() => confirm_.mutate()}>
          Got it
        </Button>
      </div>
      <ErrorBox error={confirm_.error ?? reject.error} />
    </section>
  )
}
