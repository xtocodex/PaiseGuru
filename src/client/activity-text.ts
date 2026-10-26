import { formatRupees } from '../domain/money.ts'

type ActivityRow = { kind: string; actor: string | null; payload: unknown }

/** Plain-English line for an activity row. `me` is the viewer's name, shown as "You". */
export function activityText(n: ActivityRow, me?: string) {
  const who = n.actor ? (n.actor === me ? 'You' : n.actor) : 'Someone'
  const p = (n.payload ?? {}) as { kind?: string; amountPaise?: number; name?: string; into?: string; note?: string }
  const amount = p.amountPaise ? formatRupees(p.amountPaise) : ''
  const what = p.note ? `"${p.note}"` : { expense: 'an expense', refund: 'a refund', fund_in: 'money in' }[p.kind ?? ''] ?? 'an expense'
  switch (n.kind) {
    case 'expense_create': return `${who} added ${what} of ${amount}`
    case 'expense_edit': return `${who} changed ${what} to ${amount}`
    case 'expense_delete': return `${who} deleted ${what} of ${amount}`
    case 'close': return `${who} closed a month`
    case 'reopen': return `${who} reopened a month`
    case 'payment_sent': return `${who} recorded a payment of ${amount}`
    case 'payment_confirmed': return `${who} confirmed getting ${amount}`
    case 'payment_rejected': return `${who} said ${amount} was not received`
    case 'payment_deleted': return `${who} removed a payment of ${amount}`
    case 'member_join': return `${p.name} joined`
    case 'member_claim': return `${who} joined as ${p.name}`
    case 'member_approve': return `${who} approved ${p.name}`
    case 'member_unclaim': return `${who} undid ${p.name}'s join`
    case 'member_merge': return `${who} linked ${p.name} to ${p.into}`
    case 'member_leave': return `${p.name} left`
    case 'member_remove': return `${who} removed ${p.name}`
    case 'admin_handover': return `${p.name} is now the admin`
    case 'placeholder_add': return `${who} added ${p.name}`
    case 'member_invite': return `${who} invited ${p.name} by email`
    case 'group_create': return `${who} created ${p.name}`
    case 'group_edit': return `${who} changed the group settings`
    case 'fund_create': return `${who} added the fund ${p.name}`
    default: return `${who} made a change`
  }
}

export const ACTIVITY_GROUP: Record<string, 'expenses' | 'payments' | 'members'> = {
  expense_create: 'expenses', expense_edit: 'expenses', expense_delete: 'expenses', fund_create: 'expenses',
  close: 'payments', reopen: 'payments', payment_sent: 'payments', payment_confirmed: 'payments', payment_rejected: 'payments', payment_deleted: 'payments',
  member_join: 'members', member_claim: 'members', member_approve: 'members', member_unclaim: 'members', member_merge: 'members',
  member_leave: 'members', member_remove: 'members', admin_handover: 'members', placeholder_add: 'members', member_invite: 'members', group_create: 'members', group_edit: 'members',
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
