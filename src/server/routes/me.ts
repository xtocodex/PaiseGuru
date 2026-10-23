// The signed-in user: profile, account deletion, Activity, Home (balances, what to pay, what to confirm, news).
import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { sheetName } from '../../domain/group.ts'
import { updateMeSchema } from '../../shared/schemas.ts'
import { activity, group, member, payment, sheet, user } from '../db.ts'
import { db, json, type Env } from '../core.ts'
import { groupBalances, upiIdsOf } from './payment.ts'

export const meRoutes = new Hono<Env>()
  .get('/me', async (c) => {
    const [u] = await db.select().from(user).where(eq(user.id, c.var.user.id))
    return c.json({ id: u!.id, name: u!.name, email: u!.email, image: u!.image, upiId: u!.upiId })
  })

  .patch('/me', json(updateMeSchema), async (c) => {
    const { name, upiId } = c.req.valid('json')
    await db
      .update(user)
      .set({ name, upiId: upiId === undefined ? undefined : upiId || null })
      .where(eq(user.id, c.var.user.id))
    return c.json({ ok: true })
  })

  // Member rows become "Deleted user" with every amount kept; admin roles pass to the oldest real member.
  .delete('/me', async (c) => {
    const uid = c.var.user.id
    await db.transaction(async (tx) => {
      const mine = await tx.select().from(member).where(eq(member.userId, uid))
      for (const m of mine) {
        await tx.update(member).set({ role: 'member', status: 'deleted', displayName: 'Deleted user', userId: null }).where(eq(member.id, m.id))
        if (m.role !== 'admin') continue
        const [heir] = await tx
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.groupId, m.groupId), eq(member.status, 'active'), sql`${member.userId} is not null`))
          .orderBy(asc(member.seq))
          .limit(1)
        await tx
          .update(member)
          .set({ role: 'admin' })
          .where(eq(member.id, heir?.id ?? m.id)) // nobody left: the role stays on the deleted row
      }
      await tx.delete(user).where(eq(user.id, uid))
    })
    return c.json({ ok: true })
  })

  // Everything that changed in the caller's groups, newest first.
  .get('/activity', async (c) => {
    const uid = c.var.user.id
    const mine = await db
      .select({ groupId: member.groupId, name: group.name })
      .from(member)
      .innerJoin(group, eq(group.id, member.groupId))
      .where(and(eq(member.userId, uid), eq(member.status, 'active')))
    if (!mine.length) return c.json({ items: [] })
    const rows = await db
      .select({
        id: activity.id,
        groupId: activity.groupId,
        sheetId: activity.sheetId,
        kind: activity.kind,
        payload: activity.payload,
        createdAt: activity.createdAt,
        actor: user.name,
        actorUserId: activity.actorUserId,
        month: sheet.month,
      })
      .from(activity)
      .leftJoin(user, eq(user.id, activity.actorUserId))
      .leftJoin(sheet, eq(sheet.id, activity.sheetId))
      .where(inArray(activity.groupId, mine.map((m) => m.groupId)))
      .orderBy(desc(activity.createdAt))
      .limit(100)
    const names = new Map(mine.map((m) => [m.groupId, m.name]))
    return c.json({
      items: rows.map(({ month, actorUserId, ...r }) => ({ ...r, groupName: names.get(r.groupId)!, sheetName: month ? sheetName(month) : null, mine: actorUserId === uid })),
    })
  })

  .get('/home', async (c) => {
    const uid = c.var.user.id

    // Advance last_seen atomically and read the previous value, so two tabs never repeat or lose news.
    const seen = await db.execute<{ group_id: string; prev: string | null }>(sql`
      with prev as (select id, last_seen_at from ${member} where user_id = ${uid} and status = 'active' for update)
      update ${member} m set last_seen_at = now() from prev where m.id = prev.id
      returning m.group_id, prev.last_seen_at as prev`)
    const memberships = await db
      .select({ memberId: member.id, groupId: group.id, name: group.name, settleMode: group.settleMode, status: member.status })
      .from(member)
      .innerJoin(group, eq(group.id, member.groupId))
      .where(and(eq(member.userId, uid), inArray(member.status, ['active', 'pending'])))
      .orderBy(asc(group.name))
    const active = memberships.filter((m) => m.status === 'active')
    const groupIds = active.map((m) => m.groupId)
    const myMemberIds = active.map((m) => m.memberId)

    const balances = await Promise.all(active.map((m) => groupBalances(db, m.groupId)))
    const toPay: { groupId: string; groupName: string; from: string; to: string; toName: string; amountPaise: number }[] = []
    const toGet: { groupId: string; groupName: string; from: string; fromName: string; to: string; amountPaise: number }[] = []
    const groups = active.map((m, i) => {
      const b = balances[i]!
      const name = new Map(b.members.map((x) => [x.memberId, x.name]))
      for (const t of b.plan) {
        if (t.from === m.memberId) toPay.push({ groupId: m.groupId, groupName: m.name, ...t, toName: name.get(t.to)! })
        if (t.to === m.memberId) toGet.push({ groupId: m.groupId, groupName: m.name, ...t, fromName: name.get(t.from)! })
      }
      return { id: m.groupId, name: m.name, settleMode: m.settleMode, netPaise: b.members.find((x) => x.memberId === m.memberId)?.netPaise ?? 0 }
    })

    const [toConfirm, news, upiIds] = await Promise.all([
      !myMemberIds.length
        ? []
        : db
            .select({ id: payment.id, groupId: payment.groupId, from: payment.fromMemberId, fromName: member.displayName, amountPaise: payment.amountPaise, via: payment.via, utr: payment.utr, createdAt: payment.createdAt })
            .from(payment)
            .innerJoin(member, eq(member.id, payment.fromMemberId))
            .where(and(inArray(payment.toMemberId, myMemberIds), eq(payment.status, 'sent'), isNull(payment.deletedAt)))
            .orderBy(desc(payment.createdAt)),
      !groupIds.length
        ? []
        : db
            .select({ id: activity.id, groupId: activity.groupId, sheetId: activity.sheetId, kind: activity.kind, payload: activity.payload, createdAt: activity.createdAt, actor: user.name })
            .from(activity)
            .leftJoin(user, eq(user.id, activity.actorUserId))
            .where(and(inArray(activity.groupId, groupIds), or(isNull(activity.actorUserId), ne(activity.actorUserId, uid))))
            .orderBy(desc(activity.createdAt))
            .limit(100),
      upiIdsOf(db, [...new Set(toPay.map((t) => t.to))]),
    ])

    const prevSeen = new Map(seen.rows.map((r) => [r.group_id, r.prev ? new Date(r.prev) : null]))
    const nameById = new Map(memberships.map((m) => [m.groupId, m.name]))
    return c.json({
      owePaise: groups.reduce((s, g) => s + Math.max(0, -g.netPaise), 0),
      owedPaise: groups.reduce((s, g) => s + Math.max(0, g.netPaise), 0),
      groups,
      pending: memberships.filter((m) => m.status === 'pending').map((m) => ({ id: m.groupId, name: m.name })),
      toPay: toPay.map((t) => ({ ...t, toUpiId: upiIds[t.to] ?? null })),
      toGet,
      toConfirm: toConfirm.map((p) => ({ ...p, groupName: nameById.get(p.groupId)! })),
      news: news
        .filter((n) => {
          const prev = prevSeen.get(n.groupId)
          return prev === undefined || prev === null ? false : n.createdAt > prev
        })
        .slice(0, 30)
        .map((n) => ({ ...n, groupName: nameById.get(n.groupId)! })),
    })
  })
