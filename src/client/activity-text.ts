import { formatRupees } from '../domain/money.ts'

type ActivityRow = { kind: string; actor: string | null; payload: unknown }

/** Plain-English line for an activity row (S15). `me` is the viewer's name, shown as "You". */
export function activityText(n: ActivityRow, me?: string) {
  const who = n.actor ? (n.actor === me ? 'You' : n.actor) : 'Someone'
  const p = (n.payload ?? {}) as { type?: string; amountPaise?: number; name?: string; into?: string }
  const amount = p.amountPaise ? formatRupees(p.amountPaise) : ''
  const what = { bill: 'a bill', refund: 'a refund', money_given: 'money given', money_in: 'money in' }[p.type ?? ''] ?? 'an entry'
  if (p.type === 'money_in' && n.kind === 'entry_create') return `${who} added ${amount} money in`
  switch (n.kind) {
    case 'entry_create': return `${who} added ${what} of ${amount}`
    case 'entry_edit': return `${who} changed ${what} to ${amount}`
    case 'entry_delete': return `${who} deleted ${what} of ${amount}`
    case 'close': return `${who} closed a month`
    case 'reopen': return `${who} reopened a month`
    case 'transfer_paid': return `${who} marked ${amount} paid`
    case 'member_join': return `${p.name} joined`
    case 'member_claim': return `${who} joined as ${p.name}`
    case 'member_approve': return `${who} approved ${p.name}`
    case 'member_unclaim': return `${who} undid ${p.name}'s join`
    case 'member_merge': return `${who} linked ${p.name} to ${p.into}`
    case 'member_leave': return `${p.name} left`
    case 'member_remove': return `${who} removed ${p.name}`
    case 'admin_handover': return `${p.name} is now the admin`
    case 'placeholder_add': return `${who} added ${p.name}`
    case 'hisaab_create': return `${who} created ${p.name}`
    default: return `${who} made a change`
  }
}

export const ACTIVITY_GROUP: Record<string, 'bills' | 'payments' | 'members'> = {
  entry_create: 'bills', entry_edit: 'bills', entry_delete: 'bills',
  close: 'payments', reopen: 'payments', transfer_paid: 'payments',
  member_join: 'members', member_claim: 'members', member_approve: 'members', member_unclaim: 'members',
  member_merge: 'members', member_leave: 'members', member_remove: 'members', admin_handover: 'members', placeholder_add: 'members', hisaab_create: 'members',
}

/** "2h ago", "Yesterday", "3 Sep". */
export function timeAgo(iso: string | Date, now = new Date()) {
  const d = new Date(iso)
  const min = Math.round((now.getTime() - d.getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.round(min / 60)}h ago`
  if (min < 48 * 60) return 'yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}
