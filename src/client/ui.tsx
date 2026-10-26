// Shared UI (design v2: docs/designs/v2). Mobile app feel: 44px+ touch targets, pressed feedback,
// safe areas, tabular amounts. Colours come only from the tokens in index.css.
import { useCallback, useEffect, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
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
      <header className="pt-safe sticky top-0 z-20 bg-paper/90 backdrop-blur-md [view-transition-name:page-header]">
        <div className="flex min-h-16 items-center gap-1 px-2">
          {(props.back !== undefined || props.close) && (
            <IconButton label={props.close ? 'Close' : 'Back'} icon={props.close ? X : ChevronLeft} onClick={goBack} />
          )}
          <div className={cx('min-w-0 flex-1', props.back === undefined && !props.close && 'pl-2')}>
            <h1 className="truncate text-page font-bold leading-tight tracking-tight">{props.title}</h1>
            {props.subtitle && <p className="truncate text-caption font-medium text-muted">{props.subtitle}</p>}
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
    <div className="mt-3 -mb-2 flex items-center justify-between">
      <h2 className="text-title font-semibold">{children}</h2>
      {action}
    </div>
  )
}

export function Money({ paise, className, sign }: { paise: number; className?: string; sign?: boolean }) {
  return <span className={cx('num whitespace-nowrap', className)}>{sign && paise > 0 ? '+' : ''}{formatRupees(paise)}</span>
}

// ── buttons ──

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'upi'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand disabled:opacity-50',
  secondary: 'border border-line bg-card text-brand-text disabled:opacity-50',
  ghost: 'text-brand-text disabled:opacity-50',
  danger: 'border border-line bg-card text-pays',
  destructive: 'bg-pays text-paper disabled:opacity-50',
  upi: 'bg-gets text-on-gets',
}
const sizes = { md: 'h-[52px] rounded-[14px] px-5 text-base gap-2', sm: 'h-11 rounded-xl px-3.5 text-body gap-1.5' }

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
  const title = <span className="text-caption font-semibold text-muted">{label}</span>
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
      {hint && !error && <p className="text-caption leading-snug text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-body text-pays">
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
              'press inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-body font-medium',
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
            className={cx('h-10 rounded-[9px] text-body', on ? 'bg-card font-semibold shadow-sm' : 'font-medium text-muted')}
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
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold leading-none', tones[tone])}>{children}</span>
}

export const STATE_LABEL = { open: 'Open', closed: 'Closed' } as const
export function StateTag({ state }: { state: keyof typeof STATE_LABEL }) {
  return <Tag tone={state === 'open' ? 'brand' : 'gets'}>{STATE_LABEL[state]}</Tag>
}

/** "You owe ₹500" / "You are owed ₹500" / "All settled", for a net (+ is owed money). */
export function NetText({ paise, who = 'You', className }: { paise: number; who?: string; className?: string }) {
  if (paise === 0) return <span className={cx('text-muted', className)}>All settled</span>
  return (
    <span className={className}>
      {who} {paise > 0 ? (who === 'You' ? 'are owed' : 'is owed') : who === 'You' ? 'owe' : 'owes'}{' '}
      <Money paise={Math.abs(paise)} className={cx('font-bold', paise > 0 ? 'text-gets' : 'text-pays')} />
    </span>
  )
}

// No reds or greens: those mean owes / is owed. White text is 5.5:1 or more on each.
const AVATAR_COLORS = ['#3446c2', '#1f6f9c', '#6b3fb0', '#8a3f9e', '#8a5300', '#4b5568', '#0e6f86', '#7a5a3a']
/**
 * A person's initial. The viewer is always the brand colour; everyone else is coloured by first name,
 * so one person looks the same on every screen and in every group.
 * shortcut: keyed by first name, so two people called Asha share a colour; key by user id if that confuses.
 */
export function Avatar({ name, me, size = 36, muted }: { name: string; me?: boolean; size?: number; muted?: boolean }) {
  let h = 0
  for (const ch of name.trim().split(/\s+/)[0]!.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center rounded-full font-semibold', muted ? 'bg-line text-muted' : me ? 'bg-brand text-on-brand' : 'text-white')}
      style={{ width: size, height: size, fontSize: size * 0.4, background: muted || me ? undefined : AVATAR_COLORS[h % AVATAR_COLORS.length] }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

export function IconTile({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: 'brand' | 'sky' | 'gets' | 'marigold' }) {
  const t = { brand: 'bg-brand-soft text-brand-text', sky: 'bg-sky-soft text-sky-text', gets: 'bg-gets-soft text-gets', marigold: 'bg-marigold-soft text-marigold-text' }[tone]
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
export function Row(props: { left?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; to?: string; params?: any; search?: any; onClick?: () => void; chevron?: boolean }) {
  const main = (
    <>
      {props.left}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium">{props.title}</span>
        {props.subtitle && <span className="block text-caption leading-snug text-muted">{props.subtitle}</span>}
      </span>
      {props.chevron && <ChevronRight className="size-5 text-faint" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left'
  // Tappable rows light up under the finger, like a native list.
  const tap = 'press -mx-2 rounded-xl px-2 active:bg-line/60'
  return (
    <div className="flex items-center gap-3">
      {props.to ? (
        <Link to={props.to as any} params={props.params} search={props.search} className={cx(cls, tap)}>
          {main}
        </Link>
      ) : props.onClick ? (
        <button type="button" onClick={props.onClick} className={cx(cls, tap)}>
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
    <p role="alert" className="rounded-xl bg-pays-soft p-3 text-body text-pays">
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
      <p className="mt-1 mb-4 text-body text-muted">{text}</p>
      {action}
    </div>
  )
}

/** The PaiseGuru logo: the P mark and/or the wordmark (the logo's own lettering, light or dark by theme). */
export function Logo({ mark = true, word = true, size = 64 }: { mark?: boolean; word?: boolean; size?: number }) {
  return (
    <span role="img" aria-label="PaiseGuru" className="inline-flex items-center gap-3">
      {mark && <img src="/logo-mark.png" alt="" width={size} height={Math.round(size * 0.82)} className="shrink-0" />}
      {word && <span aria-hidden className="block bg-contain bg-left bg-no-repeat [background-image:var(--wordmark)]" style={{ width: size * 2.6, height: size * 0.46 }} />}
    </span>
  )
}

export const FOUNDER_URL = 'https://gopalmohapatra.in'

/** Product credit: PaiseGuru is built by xtocodex. */
export function MadeBy({ className }: { className?: string }) {
  return (
    <p className={cx('text-center text-caption text-faint', className)}>
      A product of <span className="font-semibold text-muted">xtocodex</span> · Founder{' '}
      <a href={FOUNDER_URL} target="_blank" rel="noreferrer" className="font-semibold text-muted underline-offset-2 hover:underline">
        Gopal Mohapatra
      </a>
    </p>
  )
}

let openSheets = 0

/** Bottom sheet (modal). Closes on the scrim, Escape or the close button; focus moves inside. Sheets can stack. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Slide down, then let the parent unmount the sheet.
  const dismiss = useCallback(() => {
    const p = panel.current
    if (!p || matchMedia('(prefers-reduced-motion: reduce)').matches) return closeRef.current()
    p.style.transition = 'transform 200ms cubic-bezier(0.4, 0, 1, 1)'
    p.style.transform = 'translateY(100%)'
    if (scrim.current) Object.assign(scrim.current.style, { transition: 'opacity 200ms', opacity: '0' })
    setTimeout(() => closeRef.current(), 190)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([aria-label="Close"])')?.focus()
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (e.key === 'Escape' && dialogs[dialogs.length - 1] === panel.current) dismiss()
    }
    document.addEventListener('keydown', onKey)
    openSheets++
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      if (--openSheets === 0) document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, dismiss])

  // Drag the handle or title down to close: past a quarter of the sheet, or a quick flick.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    panel.current!.style.transition = 'none'
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.dy = Math.max(0, e.clientY - d.y)
    panel.current!.style.transform = `translateY(${d.dy}px)`
    if (scrim.current) scrim.current.style.opacity = String(1 - d.dy / panel.current!.offsetHeight)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const p = panel.current!
    if (d.dy > p.offsetHeight / 4 || d.dy / (performance.now() - d.t) > 0.6) return dismiss()
    p.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)'
    p.style.transform = ''
    if (scrim.current) scrim.current.style.opacity = ''
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div ref={scrim} className="scrim-enter absolute inset-0 bg-scrim" onClick={dismiss} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-enter absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-card px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="-mx-4 -mt-2.5 flex touch-none flex-col gap-4 px-4 pt-2.5 select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-field" aria-hidden />
          <div className="flex items-center justify-between">
            <h2 className="text-title font-semibold">{title}</h2>
            <IconButton icon={X} label="Close" onClick={dismiss} className="-mr-2" />
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── toast and confirm: called from anywhere, drawn once by <Overlays /> in the root route ──

type ToastItem = { id: number; text: string; action?: { label: string; run: () => void } }
type Ask = { title: string; text?: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void }
let overlay: { toast: ToastItem | null; ask: Ask | null } = { toast: null, ask: null }
const listeners = new Set<() => void>()
const setOverlay = (next: Partial<typeof overlay>) => {
  overlay = { ...overlay, ...next }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** A short note above the tab bar ("₹500 marked as sent · Undo"). Replaces any toast showing. */
export function toast(text: string, action?: ToastItem['action']) {
  clearTimeout(toastTimer)
  setOverlay({ toast: { id: Date.now(), text, action } })
  toastTimer = setTimeout(() => setOverlay({ toast: null }), action ? 6000 : 4000)
}

/** A light tap on phones that support it (Android), after money changes hands. */
export const haptic = () => navigator.vibrate?.(10)

/** In-app confirmation sheet instead of the browser's confirm(). True when the person confirms. */
export function askConfirm(o: Omit<Ask, 'resolve'>): Promise<boolean> {
  overlay.ask?.resolve(false)
  return new Promise((resolve) => setOverlay({ ask: { ...o, resolve } }))
}

export function Overlays() {
  const { toast: t, ask: a } = useSyncExternalStore(subscribe, () => overlay)
  const answer = (ok: boolean) => {
    a?.resolve(ok)
    setOverlay({ ask: null })
  }
  return (
    <>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[60] mx-auto flex max-w-md justify-center px-4">
        {t && (
          <div key={t.id} className="toast-enter pointer-events-auto flex min-h-12 w-full items-center gap-2 rounded-2xl bg-text py-1 pr-1 pl-4 text-body text-paper shadow-[0_8px_24px_-8px_rgb(16_19_28/0.45)]">
            <span className="flex-1 py-2">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="press h-11 rounded-xl px-3 font-semibold underline underline-offset-4"
                onClick={() => {
                  t.action!.run()
                  setOverlay({ toast: null })
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {a && (
        <Sheet open onClose={() => answer(false)} title={a.title}>
          {a.text && <p className="-mt-2 text-body leading-snug text-muted">{a.text}</p>}
          <div className="flex flex-col gap-2">
            <Button variant={a.danger ? 'destructive' : 'primary'} onClick={() => answer(true)}>
              {a.confirm}
            </Button>
            <Button variant="ghost" onClick={() => answer(false)}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}
