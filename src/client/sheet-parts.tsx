import { formatRupees } from '../domain/money.ts'
import { Money } from './ui.tsx'

export const EXCEPTION_TAG = (p: { exception: string; exceptionPaise: number }) =>
  p.exception === 'fixed' ? `fixed ${formatRupees(p.exceptionPaise)}` : p.exception === 'extra' ? `${formatRupees(p.exceptionPaise)} extra` : p.exception === 'skip' ? 'skip' : null

export function Categories({ categories }: { categories: Record<string, number> }) {
  const parts = Object.entries(categories)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
  if (!parts.length) return null
  return <p className="text-sm text-slate-600">{parts.map(([k, v]) => `${k} ${formatRupees(v)}`).join(' · ')}</p>
}

/** "gets ₹1,500" / "pays ₹3,000" / "settled" for a member's net. */
export function NetText({ net }: { net: number }) {
  if (net > 0) return <span className="text-brand">gets <Money paise={net} /></span>
  if (net < 0) return <span className="text-red-700">pays <Money paise={-net} /></span>
  return <span className="text-slate-500">settled</span>
}
