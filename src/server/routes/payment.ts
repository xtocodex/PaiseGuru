// Balances (derived, never stored) and payments: Sent counts at once, the receiver confirms or says Not received.
import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { netOf, settlePlan, type Transfer } from '../../domain/group.ts'
import { createPaymentSchema } from '../../shared/schemas.ts'
import { expense, expensePayer, expenseShare, member, payment, sheet, user, type Db, type Tx } from '../db.ts'
import { AppError, badRequest, db, json, lockGroup, logActivity, notFound, requireMember, type Env } from '../core.ts'

type Q = Db | Tx

/**
 * Every member's totals and net, in member order, plus the settle plan.
 * Month-close bills (split_mode 'sheet') count only once their month is closed; the close's obligations
 * are a 'sheet_close' expense. Refunds count with the opposite sign. Fund money never counts.
 */
export async function groupBalances(q: Q, groupId: string) {
  const signed = (col: unknown) => sql<number>`coalesce(sum(case when ${expense.kind} = 'refund' then -${col} else ${col} end), 0)`.mapWith(Number)
  const [members, paid, owed, sent, received] = await Promise.all([
    q
      .select({ id: member.id, name: member.displayName, status: member.status, userId: member.userId })
      .from(member)
      .where(eq(member.groupId, groupId))
      .orderBy(asc(member.seq)),
    q
      .select({ memberId: expensePayer.memberId, paise: signed(expensePayer.paidPaise) })
      .from(expensePayer)
      .innerJoin(expense, eq(expense.id, expensePayer.expenseId))
      .leftJoin(sheet, eq(sheet.id, expense.sheetId))
      .where(and(eq(expense.groupId, groupId), isNull(expense.deletedAt), sql`(${expense.splitMode} <> 'sheet' or ${sheet.state} = 'closed')`))
      .groupBy(expensePayer.memberId),
    q
      .select({ memberId: expenseShare.memberId, paise: signed(expenseShare.owedPaise) })
      .from(expenseShare)
      .innerJoin(expense, eq(expense.id, expenseShare.expenseId))
      .where(and(eq(expense.groupId, groupId), isNull(expense.deletedAt)))
      .groupBy(expenseShare.memberId),
    q
      .select({ memberId: payment.fromMemberId, paise: sql<number>`sum(${payment.amountPaise})`.mapWith(Number) })
      .from(payment)
      .where(and(eq(payment.groupId, groupId), isNull(payment.deletedAt)))
      .groupBy(payment.fromMemberId),
    q
      .select({ memberId: payment.toMemberId, paise: sql<number>`sum(${payment.amountPaise})`.mapWith(Number) })
      .from(payment)
      .where(and(eq(payment.groupId, groupId), isNull(payment.deletedAt)))
      .groupBy(payment.toMemberId),
  ])
  const get = (rows: { memberId: string; paise: number }[], id: string) => rows.find((r) => r.memberId === id)?.paise ?? 0
  const totals = members.map((m) => {
    const t = { memberId: m.id, paidPaise: get(paid, m.id), owedPaise: get(owed, m.id), sentPaise: get(sent, m.id), receivedPaise: get(received, m.id) }
    return { ...t, name: m.name, status: m.status, placeholder: m.userId === null, netPaise: netOf(t) }
  })
  let plan: Transfer[] = []
  try {
    plan = settlePlan(totals)
  } catch {
    // Σ net ≠ 0 is a bug in how rows were written; show balances, never a wrong plan.
    console.error(JSON.stringify({ level: 'error', msg: 'nets do not sum to zero', groupId }))
  }
  return { members: totals, plan }
}

async function loadPayment(id: string) {
  const [p] = await db.select().from(payment).where(and(eq(payment.id, id), isNull(payment.deletedAt)))
  if (!p) throw notFound()
  return p
}

/** The two people in a payment act on it. A party without the app (a placeholder) can't, so any member may act for them. */
async function assertParty(tx: Tx, meId: string, ids: string[], side: 'either' | string) {
  const parties = await tx.select({ id: member.id, userId: member.userId }).from(member).where(inArray(member.id, ids))
  const relevant = side === 'either' ? parties : parties.filter((p) => p.id === side)
  if (!relevant.some((p) => p.id === meId || p.userId === null)) {
    throw new AppError(403, 'not_a_party', side === 'either' ? 'Only the two people in this payment can do this.' : 'Only the person who received it can do this.')
  }
}

export const paymentRoutes = new Hono<Env>()
  .get('/groups/:id/payments', async (c) => {
    const groupId = c.req.param('id')
    await requireMember(db, groupId, c.var.user.id, { former: true })
    // shortcut: newest 300 only, add paging when a group passes that
    const rows = await db
      .select()
      .from(payment)
      .where(and(eq(payment.groupId, groupId), isNull(payment.deletedAt)))
      .orderBy(desc(payment.createdAt))
      .limit(300)
    return c.json({
      payments: rows.map((p) => ({ id: p.id, from: p.fromMemberId, to: p.toMemberId, amountPaise: p.amountPaise, status: p.status, via: p.via, utr: p.utr, note: p.note, createdAt: p.createdAt })),
    })
  })

  .post('/groups/:id/payments', json(createPaymentSchema), async (c) => {
    const input = c.req.valid('json')
    const groupId = c.req.param('id')
    const user = c.var.user
    const out = await db.transaction(async (tx) => {
      const me = await requireMember(tx, groupId, user.id)
      await lockGroup(tx, groupId)
      const [dup] = await tx.select().from(payment).where(eq(payment.id, input.id))
      if (dup) {
        if (dup.groupId !== groupId) throw notFound()
        return { id: dup.id, created: false } // double tap: same row
      }
      if (input.fromMemberId === input.toMemberId) throw badRequest('Pick two different people.')
      const parties = await tx
        .select({ id: member.id, status: member.status })
        .from(member)
        .where(and(eq(member.groupId, groupId), inArray(member.id, [input.fromMemberId, input.toMemberId])))
      if (parties.length !== 2 || parties.some((p) => p.status !== 'active')) throw badRequest('Both people must be members of this group.')
      await assertParty(tx, me.id, [input.fromMemberId, input.toMemberId], 'either')
      await tx.insert(payment).values({ ...input, utr: input.utr || null, groupId, createdBy: user.id })
      await logActivity(tx, { groupId, actorUserId: user.id, kind: 'payment_sent', payload: { amountPaise: input.amountPaise, via: input.via } })
      return { id: input.id, created: true }
    })
    return c.json(out, out.created ? 201 : 200)
  })

  .post('/payments/:id/confirm', async (c) => {
    const p = await loadPayment(c.req.param('id'))
    const user = c.var.user
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, p.groupId, user.id)
      await lockGroup(tx, p.groupId)
      await assertParty(tx, me.id, [p.fromMemberId, p.toMemberId], p.toMemberId)
      const [row] = await tx
        .update(payment)
        .set({ status: 'confirmed', confirmedBy: user.id, confirmedAt: new Date() })
        .where(and(eq(payment.id, p.id), eq(payment.status, 'sent'), isNull(payment.deletedAt)))
        .returning()
      if (!row) throw badRequest('This payment is already confirmed.')
      await logActivity(tx, { groupId: p.groupId, actorUserId: user.id, kind: 'payment_confirmed', payload: { amountPaise: p.amountPaise } })
    })
    return c.json({ ok: true })
  })

  // The payer undoes a mistake, or the receiver says it never arrived. Either way the balance goes back.
  .delete('/payments/:id', async (c) => {
    const p = await loadPayment(c.req.param('id'))
    const user = c.var.user
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, p.groupId, user.id)
      await lockGroup(tx, p.groupId)
      await assertParty(tx, me.id, [p.fromMemberId, p.toMemberId], 'either')
      if (p.status === 'confirmed' && me.id !== p.toMemberId) throw new AppError(422, 'confirmed', 'The receiver confirmed this payment, so only they can remove it.')
      const [row] = await tx.update(payment).set({ deletedAt: new Date() }).where(and(eq(payment.id, p.id), isNull(payment.deletedAt))).returning()
      if (!row) throw notFound()
      const kind = me.id === p.toMemberId ? 'payment_rejected' : 'payment_deleted'
      await logActivity(tx, { groupId: p.groupId, actorUserId: user.id, kind, payload: { amountPaise: p.amountPaise } })
    })
    return c.json({ ok: true })
  })

/** UPI IDs of members, for Pay buttons. Members only; never on the statement page. */
export async function upiIdsOf(q: Q, memberIds: string[]): Promise<Record<string, string>> {
  if (!memberIds.length) return {}
  const rows = await q
    .select({ id: member.id, upiId: user.upiId })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(inArray(member.id, memberIds))
  return Object.fromEntries(rows.filter((r) => r.upiId).map((r) => [r.id, r.upiId!]))
}
