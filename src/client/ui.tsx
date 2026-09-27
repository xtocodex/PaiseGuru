// Shared UI (design v2: docs/designs/v2). Mobile app feel: 44px+ touch targets, pressed feedback,
// safe areas, tabular amounts. Colours come only from the tokens in index.css.
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react'
import { formatRupees } from '../domain/money.ts'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ── page ──

export function Page(props: {
  title: ReactNode
  subtitle?: ReactNode
  /** Show a back button; the path is used when there is no history (opened from a link). */
  back?: string
  close?: boolean
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const goBack = () => (window.history.length > 1 ? router.history.back() : router.navigate({ to: props.back ?? '/' }))
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-20 bg-paper/90 backdrop-blur-md">
        <div className="flex min-h-16 items-center gap-1 px-2">
          {(props.back !== undefined || props.close) && (
            <IconButton label={props.close ? 'Close' : 'Back'} icon={props.close ? X : ChevronLeft} onClick={goBack} />
          )}
          <div className={cx('min-w-0 flex-1', props.back === undefined && !props.close && 'pl-2')}>
            <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight">{props.title}</h1>
            {props.subtitle && <p className="truncate text-[13px] font-medium text-muted">{props.subtitle}</p>}
          </div>
          {props.action}
        </div>
      </header>
      <main className={cx('flex flex-1 flex-col gap-4 px-4 pt-1', props.footer ? 'pb-4' : 'pb-32')}>{props.children}</main>
      {props.footer && <div className="sticky bottom-0 z-10 bg-paper px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+14px)]">{props.footer}</div>}
    </div>
  )
}

export function IconButton({ icon: Icon, label, soft, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; soft?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={cx('press grid size-11 shrink-0 place-items-center rounded-full', soft ? 'border border-line bg-card' : 'hover:bg-card', className)}
    >
      <Icon className="size-[22px]" aria-hidden />
    </button>
  )
}

export function Card({ children, className, flush }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <section className={cx('rounded-2xl border border-line bg-card', flush ? 'px-4 py-1.5' : 'p-4', className)}>{children}</section>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="-mb-1 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  )
}

export function Money({ paise, className, sign }: { paise: number; className?: string; sign?: boolean }) {
  return <span className={cx('num whitespace-nowrap', className)}>{sign && paise > 0 ? '+' : ''}{formatRupees(paise)}</span>
}

// ── buttons ──

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'upi' | 'marigold'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand disabled:opacity-50',
  secondary: 'border border-line bg-card text-brand-text disabled:opacity-50',
  ghost: 'text-brand-text disabled:opacity-50',
  danger: 'border border-line bg-card text-pays',
  upi: 'bg-gets text-on-gets',
  marigold: 'bg-marigold text-on-marigold',
}
const sizes = { md: 'h-[52px] rounded-[14px] px-5 text-base gap-2', sm: 'h-10 rounded-xl px-3.5 text-sm gap-1.5' }

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...props}
      className={cx('press inline-flex shrink-0 items-center justify-center font-semibold disabled:cursor-not-allowed', sizes[size], variants[variant], className)}
    >
      {Icon && <Icon className={size === 'md' ? 'size-5' : 'size-4'} aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink(props: { to: string; params?: any; search?: any; children: ReactNode; variant?: Variant; size?: keyof typeof sizes; icon?: LucideIcon; className?: string }) {
  const { icon: Icon, size = 'md', variant = 'primary' } = props
  return (
    <Link to={props.to as any} params={props.params} search={props.search} className={cx('press inline-flex items-center justify-center font-semibold', sizes[size], variants[variant], props.className)}>
      {Icon && <Icon className={size === 'md' ? 'size-5' : 'size-4'} aria-hidden />}
      {props.children}
    </Link>
  )
}

// ── inputs ──

/**
 * A labelled form field. With a single input it is a <label>; with `group` (chips, several controls)
 * it is a named group, so the label never becomes the name of the first control inside it.
 */
export function Field({ label, hint, error, group, children }: { label: string; hint?: ReactNode; error?: string | null; group?: boolean; children: ReactNode }) {
  const title = <span className="text-[13px] font-semibold text-muted">{label}</span>
  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <div role="group" aria-label={label} className="flex flex-col gap-1.5">
          {title}
          {children}
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          {title}
          {children}
        </label>
      )}
      {hint && !error && <p className="text-[13px] leading-snug text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm text-pays">
          {error}
        </p>
      )}
    </div>
  )
}

const fieldClass = 'h-[52px] w-full rounded-xl border border-field bg-card px-3.5 text-base outline-none focus:border-brand-text focus:ring-3 focus:ring-brand-soft'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClass, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldClass, 'appearance-auto', props.className)} />
}

/** One choice from a few options, shown as tappable chips (e.g. who paid, category). */
export function Chips<T extends string>(props: {
  label: string
  options: { value: T; label: ReactNode; icon?: LucideIcon }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-wrap gap-2">
      {props.options.map((o) => {
        const on = o.value === props.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(o.value)}
            className={cx(
              'press inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium',
              on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card',
            )}
          >
            {o.icon && <o.icon className="size-4" aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>(props: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="grid gap-1 rounded-xl bg-line/70 p-1" style={{ gridTemplateColumns: `repeat(${props.options.length}, 1fr)` }}>
      {props.options.map((o) => {
        const on = o.value === props.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(o.value)}
            className={cx('h-10 rounded-[9px] text-sm', on ? 'bg-card font-semibold shadow-sm' : 'font-medium text-muted')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── small things ──

type Tone = 'brand' | 'marigold' | 'gets' | 'pays' | 'neutral'
const tones: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-text',
  marigold: 'bg-marigold-soft text-marigold-text',
  gets: 'bg-gets-soft text-gets',
  pays: 'bg-pays-soft text-pays',
  neutral: 'bg-line/70 text-muted',
}
export function Tag({ children, tone = 'brand' }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none', tones[tone])}>{children}</span>
}

export const STATE_LABEL = { open: 'Open', closed: 'Payments pending', cleared: 'Settled', carried: 'Carried' } as const
export function StateTag({ state }: { state: keyof typeof STATE_LABEL }) {
  return <Tag tone={state === 'open' ? 'brand' : state === 'closed' ? 'marigold' : 'gets'}>{STATE_LABEL[state]}</Tag>
}

const AVATAR_COLORS = ['#23306e', '#0e7a5c', '#8a3f9e', '#b56a00', '#1f6f9c', '#a3334e']
export function Avatar({ name, id, size = 36, muted }: { name: string; id: string; size?: number; muted?: boolean }) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center rounded-full font-semibold', muted ? 'bg-line text-muted' : 'text-white')}
      style={{ width: size, height: size, fontSize: size * 0.4, background: muted ? undefined : AVATAR_COLORS[h % AVATAR_COLORS.length] }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

export function IconTile({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: 'brand' | 'gets' | 'marigold' }) {
  const t = { brand: 'bg-brand-soft text-brand-text', gets: 'bg-gets-soft text-gets', marigold: 'bg-marigold-soft text-marigold-text' }[tone]
  return (
    <span aria-hidden className={cx('grid size-9 shrink-0 place-items-center rounded-xl', t)}>
      <Icon className="size-[18px]" />
    </span>
  )
}

/**
 * A list row. The main part is a link, a button or plain content; `right` sits beside it (never inside it),
 * so it may hold its own button. Rows go inside <Card flush> with <Rows> dividers.
 */
export function Row(props: { left?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; to?: string; params?: any; onClick?: () => void; chevron?: boolean }) {
  const main = (
    <>
      {props.left}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{props.title}</span>
        {props.subtitle && <span className="block text-[13px] leading-snug text-muted">{props.subtitle}</span>}
      </span>
      {props.chevron && <ChevronRight className="size-5 text-faint" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left'
  return (
    <div className="flex items-center gap-3">
      {props.to ? (
        <Link to={props.to as any} params={props.params} className={cx(cls, 'press')}>
          {main}
        </Link>
      ) : props.onClick ? (
        <button type="button" onClick={props.onClick} className={cx(cls, 'press')}>
          {main}
        </button>
      ) : (
        <div className={cls}>{main}</div>
      )}
      {props.right}
    </div>
  )
}
export const Rows = ({ children }: { children: ReactNode }) => <div className="divide-y divide-line">{children}</div>

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl bg-pays-soft p-3 text-sm text-pays">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </p>
  )
}

export function Loading() {
  return (
    <div className="pt-safe space-y-3 p-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-40 animate-pulse rounded-lg bg-line/70" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-line/60" />
      ))}
    </div>
  )
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-field px-6 py-8 text-center">
      <IconTile icon={Icon} />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 mb-4 text-sm text-muted">{text}</p>
      {action}
    </div>
  )
}

export const FOUNDER_URL = 'https://gopalmohapatra.in'

/** Product credit: PaiseGuru is built by xtocodex. */
export function MadeBy({ className }: { className?: string }) {
  return (
    <p className={cx('text-center text-xs text-faint', className)}>
      A product of <span className="font-semibold text-muted">xtocodex</span> · Founder{' '}
      <a href={FOUNDER_URL} target="_blank" rel="noreferrer" className="font-semibold text-muted underline-offset-2 hover:underline">
        Gopal Mohapatra
      </a>
    </p>
  )
}

/** Bottom sheet (modal). Closes on the scrim, Escape or the close button; focus moves inside. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([aria-label="Close"])')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="scrim-enter absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-enter absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-card px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-field" aria-hidden />
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
        </div>
        {children}
      </div>
    </div>
  )
}
