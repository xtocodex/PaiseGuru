// The signed-in user: profile, account deletion (S3), Home (S7 ledger lines, S15 news).
import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { closeSheet, monthOf, sheetName, type CloseResult, type Participant } from '../../domain/hisaab.ts'
import { updateMeSchema } from '../../shared/schemas.ts'
import { activity, entry, hisaab, member, sheet, sheetParticipant, sheetSnapshot, transfer, user } from '../db.ts'
import { clock, db, json, type Env } from '../core.ts'

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

  // S3: member rows become "Deleted user" with every amount kept; admin roles pass to the oldest real member.
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
          .where(and(eq(member.hisaabId, m.hisaabId), eq(member.status, 'active'), sql`${member.userId} is not null`))
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

  .get('/home', async (c) => {
    const uid = c.var.user.id
    const today = clock.today()
    const thisMonth = monthOf(today)

    // S15: advance last_seen atomically and read the previous value, so two tabs never repeat or lose news.
    const seen = await db.execute<{ hisaab_id: string; prev: string | null }>(sql`
      with prev as (select id, last_seen_at from ${member} where user_id = ${uid} and status = 'active' for update)
      update ${member} m set last_seen_at = now() from prev where m.id = prev.id
      returning m.hisaab_id, prev.last_seen_at as prev`)
    const memberships = await db
      .select({ memberId: member.id, hisaabId: hisaab.id, name: hisaab.name, status: member.status })
      .from(member)
      .innerJoin(hisaab, eq(hisaab.id, member.hisaabId))
      .where(and(eq(member.userId, uid), inArray(member.status, ['active', 'pending'])))
      .orderBy(asc(hisaab.name))
    const active = memberships.filter((m) => m.status === 'active')
    const hisaabIds = active.map((m) => m.hisaabId)
    const myMemberIds = active.map((m) => m.memberId)

    const sheets = !hisaabIds.length ? [] : await db
      .select()
      .from(sheet)
      .where(and(inArray(sheet.hisaabId, hisaabIds), or(eq(sheet.state, 'open'), eq(sheet.month, thisMonth))))
      .orderBy(asc(sheet.startDate))
    const openIds = sheets.filter((s) => s.state === 'open').map((s) => s.id)
    const closedIds = sheets.filter((s) => s.state !== 'open').map((s) => s.id)
    const [parts, entries, snaps, payments, news] = await Promise.all([
      openIds.length
        ? db
            .select({ sheetId: sheetParticipant.sheetId, memberId: sheetParticipant.memberId, seq: member.seq, exception: sheetParticipant.exception, exceptionPaise: sheetParticipant.exceptionPaise, weight: sheetParticipant.weight })
            .from(sheetParticipant)
            .innerJoin(member, eq(member.id, sheetParticipant.memberId))
            .where(inArray(sheetParticipant.sheetId, openIds))
        : [],
      openIds.length ? db.select().from(entry).where(and(inArray(entry.sheetId, openIds), isNull(entry.deletedAt))) : [],
      closedIds.length ? db.select().from(sheetSnapshot).where(inArray(sheetSnapshot.sheetId, closedIds)) : [],
      !myMemberIds.length ? [] : db
        .select({ id: transfer.id, sheetId: transfer.sheetId, hisaabId: transfer.hisaabId, from: transfer.fromMemberId, to: transfer.toMemberId, amountPaise: transfer.amountPaise, month: sheet.month })
        .from(transfer)
        .innerJoin(sheet, eq(sheet.id, transfer.sheetId))
        .where(and(eq(transfer.status, 'unpaid'), or(inArray(transfer.fromMemberId, myMemberIds), inArray(transfer.toMemberId, myMemberIds)))),
      !hisaabIds.length ? [] : db
        .select({ id: activity.id, hisaabId: activity.hisaabId, sheetId: activity.sheetId, kind: activity.kind, payload: activity.payload, createdAt: activity.createdAt, actor: user.name })
        .from(activity)
        .leftJoin(user, eq(user.id, activity.actorUserId))
        .where(and(inArray(activity.hisaabId, hisaabIds), or(isNull(activity.actorUserId), ne(activity.actorUserId, uid))))
        .orderBy(desc(activity.createdAt))
        .limit(100),
    ])

    const prevSeen = new Map(seen.rows.map((r) => [r.hisaab_id, r.prev ? new Date(r.prev) : null]))
    const nameById = new Map(memberships.map((m) => [m.hisaabId, m.name]))
    const memberNames = new Map(
      (payments.length
        ? await db
            .select({ id: member.id, name: member.displayName })
            .from(member)
            .where(inArray(member.id, [...new Set(payments.flatMap((p) => [p.from, p.to]))]))
        : []
      ).map((m) => [m.id, m.name]),
    )

    let spendPaise = 0
    const hisaabs = active.map((m) => {
      const lines = sheets
        .filter((s) => s.hisaabId === m.hisaabId)
        .map((s) => {
          let result: CloseResult | null = null
          if (s.state === 'open') {
            const r = closeSheet(
              parts.filter((p) => p.sheetId === s.id) as Participant[],
              entries.filter((e) => e.sheetId === s.id).map((e) => ({ type: e.type, amountPaise: e.amountPaise, category: e.category, paidBy: e.paidByMemberId, to: e.toMemberId })),
            )
            result = r.ok ? r : null
          } else {
            result = (snaps.find((x) => x.sheetId === s.id)?.data as CloseResult | undefined) ?? null
          }
          const mine = result?.members.find((x) => x.memberId === m.memberId)?.obligationPaise ?? null
          if (s.state !== 'open' && s.month === thisMonth && mine) spendPaise += mine
          // Before close this is an estimate only; it never counts toward spend (S7).
          return { sheetId: s.id, sheetName: sheetName(s.month), state: s.state, myPaise: mine, estimate: s.state === 'open' }
        })
      return { id: m.hisaabId, name: m.name, lines }
    })

    return c.json({
      monthName: sheetName(thisMonth),
      spendPaise,
      hisaabs,
      pending: memberships.filter((m) => m.status === 'pending').map((m) => ({ id: m.hisaabId, name: m.name })),
      payments: payments.map((p) => ({
        ...p,
        hisaabName: nameById.get(p.hisaabId)!,
        sheetName: sheetName(p.month),
        fromName: memberNames.get(p.from)!,
        toName: memberNames.get(p.to)!,
        iPay: myMemberIds.includes(p.from),
      })),
      news: news
        .filter((n) => {
          const prev = prevSeen.get(n.hisaabId)
          return prev === undefined || prev === null ? false : n.createdAt > prev
        })
        .slice(0, 30)
        .map((n) => ({ ...n, hisaabName: nameById.get(n.hisaabId)! })),
    })
  })
