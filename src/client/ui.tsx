// Small UI pieces shared by the pages. Mobile-first: touch targets ≥ 44 px, amounts in tabular numerals.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { formatRupees } from '../domain/money.ts'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Page({ title, back, children, action }: { title: ReactNode; back?: boolean; children: ReactNode; action?: ReactNode }) {
  const router = useRouter()
  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur">
        {back && (
          <button aria-label="Back" onClick={() => router.history.back()} className="grid size-11 place-items-center rounded-full text-xl text-slate-600 hover:bg-slate-100">
            ←
          </button>
        )}
        <h1 className={cx('min-w-0 flex-1 truncate text-lg font-semibold', !back && 'pl-2')}>{title}</h1>
        {action}
      </header>
      <main className="space-y-4 p-4">{children}</main>
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-slate-200 bg-white p-4', className)}>{children}</section>
}

export function Money({ paise, className }: { paise: number; className?: string }) {
  return <span className={cx('num whitespace-nowrap', className)}>{formatRupees(paise)}</span>
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-slate-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-brand hover:bg-brand-soft/60 disabled:text-slate-400',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
}

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={cx('min-h-11 rounded-xl px-4 font-semibold transition-colors disabled:cursor-not-allowed', variants[variant], className)} />
}

export function ButtonLink({ to, params, search, children, variant = 'primary', className }: { to: string; params?: any; search?: any; children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <Link to={to as any} params={params} search={search} className={cx('inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-semibold', variants[variant], className)}>
      {children}
    </Link>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
        {children}
      </label>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  )
}

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, props.className)} />
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'brand' | 'amber' | 'red' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', brand: 'bg-brand-soft text-brand-dark', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800' }
  return <span className={cx('inline-block rounded-md px-1.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
}

export function Loading() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
      ))}
    </div>
  )
}

export const STATE_LABEL = { open: 'Open', closed: 'Payments pending', cleared: 'Settled', carried: 'Carried' } as const
export function StateTag({ state }: { state: keyof typeof STATE_LABEL }) {
  return <Tag tone={state === 'open' ? 'brand' : state === 'closed' ? 'amber' : 'slate'}>{STATE_LABEL[state]}</Tag>
}
