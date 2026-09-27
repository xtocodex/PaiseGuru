// Hisaab, members, invite and join routes (S3, S5).
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { addMonths, monthOf, sheetName } from '../../domain/hisaab.ts'
import { addPlaceholderSchema, createHisaabSchema, joinSchema, memberIdSchema, mergeSchema } from '../../shared/schemas.ts'
import { entry, hisaab, member, sheet, sheetParticipant, transfer, type Tx } from '../db.ts'
import {
  AppError,
  addToOpenSheets,
  appUrl,
  badRequest,
  bumpOpenSheets,
  clock,
  db,
  ensureSheets,
  hashToken,
  json,
  loadHisaab,
  lockSheets,
  logActivity,
  notFound,
  removeFromOpenSheets,
  requireMember,
  tokenFor,
  type Env,
  type MemberRow,
} from '../core.ts'

const inviteLink = (nonce: string | null) => (nonce ? `${appUrl()}/join/${tokenFor('invite', nonce)}` : null)

const memberView = (m: MemberRow, meId: string) => ({
  id: m.id,
  name: m.displayName,
  role: m.role,
  status: m.status,
  placeholder: m.userId === null && m.status === 'active',
  isMe: m.id === meId,
})

async function loadMember(tx: Tx, hisaabId: string, memberId: string) {
  const [m] = await tx
    .select()
    .from(member)
    .where(and(eq(member.hisaabId, hisaabId), eq(member.id, memberId)))
  if (!m) throw notFound()
  return m
}

async function findByInvite(token: string) {
  const [h] = await db.select().from(hisaab).where(eq(hisaab.inviteTokenHash, hashToken(token)))
  if (!h) throw new AppError(404, 'invite_invalid', 'This invite link is not valid. It may have been replaced by a new one.')
  return h
}

export const hisaabRoutes = new Hono<Env>()
  .get('/hisaabs', async (c) => {
    const rows = await db
      .select({ id: hisaab.id, name: hisaab.name, forLabel: hisaab.forLabel, role: member.role, status: member.status })
      .from(member)
      .innerJoin(hisaab, eq(hisaab.id, member.hisaabId))
      .where(and(eq(member.userId, c.var.user.id), ne(member.status, 'deleted')))
      .orderBy(asc(hisaab.name))
    return c.json({ hisaabs: rows })
  })

  .post('/hisaabs', json(createHisaabSchema), async (c) => {
    const input = c.req.valid('json')
    const thisMonth = monthOf(clock.today())
    if (input.startMonth > thisMonth || input.startMonth < addMonths(thisMonth, -12)) {
      throw badRequest('The start month must be this month or up to 12 months back.')
    }
    const id = await db.transaction(async (tx) => {
      const [h] = await tx
        .insert(hisaab)
        .values({ name: input.name, forLabel: input.forLabel || null, category: input.category, startMonth: input.startMonth, createdBy: c.var.user.id })
        .returning()
      await tx.insert(member).values([
        { hisaabId: h!.id, userId: c.var.user.id, displayName: c.var.user.name, role: 'admin' as const },
        ...input.members.map((name) => ({ hisaabId: h!.id, displayName: name })),
      ])
      await ensureSheets(tx, h!)
      await logActivity(tx, { hisaabId: h!.id, actorUserId: c.var.user.id, kind: 'hisaab_create', payload: { name: h!.name } })
      return h!.id
    })
    return c.json({ id }, 201)
  })

  .get('/hisaabs/:id', async (c) => {
    const h = await loadHisaab(db, c.req.param('id'))
    const me = await requireMember(db, h.id, c.var.user.id, { pending: true, former: true })
    if (me.status === 'pending') return c.json({ id: h.id, name: h.name, pending: true as const })
    if (me.status === 'active') await db.transaction((tx) => ensureSheets(tx, h))

    const members = await db.select().from(member).where(eq(member.hisaabId, h.id)).orderBy(asc(member.seq))
    const totals = db
      .select({
        sheetId: entry.sheetId,
        total: sql<number>`sum(case when ${entry.type} = 'bill' then ${entry.amountPaise} when ${entry.type} = 'refund' then -${entry.amountPaise} else 0 end)`
          .mapWith(Number)
          .as('total'),
      })
      .from(entry)
      .where(and(eq(entry.hisaabId, h.id), isNull(entry.deletedAt)))
      .groupBy(entry.sheetId)
      .as('totals')
    let sheetsQuery = db
      .select({ id: sheet.id, month: sheet.month, startDate: sheet.startDate, endDate: sheet.endDate, state: sheet.state, total: totals.total })
      .from(sheet)
      .leftJoin(totals, eq(totals.sheetId, sheet.id))
      .where(eq(sheet.hisaabId, h.id))
      .$dynamic()
    if (me.status === 'former') {
      sheetsQuery = sheetsQuery.innerJoin(sheetParticipant, and(eq(sheetParticipant.sheetId, sheet.id), eq(sheetParticipant.memberId, me.id)))
    }
    const sheets = await sheetsQuery.orderBy(sql`${sheet.startDate} desc`)

    return c.json({
      id: h.id,
      name: h.name,
      forLabel: h.forLabel,
      category: h.category,
      joinApproval: h.joinApproval,
      pending: false as const,
      me: { memberId: me.id, role: me.role, status: me.status },
      inviteLink: me.status === 'active' ? inviteLink(h.inviteNonce) : null,
      members: members.filter((m) => m.status !== 'former' || m.id === me.id).map((m) => memberView(m, me.id)),
      sheets: sheets.map((s) => ({ ...s, name: sheetName(s.month), totalPaise: s.total ?? 0 })),
    })
  })

  .post('/hisaabs/:id/invite', async (c) => {
    const id = c.req.param('id')
    await requireMember(db, id, c.var.user.id)
    const nonce = randomUUID()
    await db
      .update(hisaab)
      .set({ inviteNonce: nonce, inviteTokenHash: hashToken(tokenFor('invite', nonce)) })
      .where(eq(hisaab.id, id))
    return c.json({ link: inviteLink(nonce)! })
  })

  .post('/hisaabs/:id/members', json(addPlaceholderSchema), async (c) => {
    const id = c.req.param('id')
    const { name } = c.req.valid('json')
    const memberId = await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      await ensureSheets(tx, await loadHisaab(tx, id))
      const sheets = await lockSheets(tx, id)
      const [count] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(member).where(eq(member.hisaabId, id))
      if (count!.n >= 100) throw badRequest('A Hisaab can have at most 100 members.')
      const [m] = await tx.insert(member).values({ hisaabId: id, displayName: name }).returning()
      // A person added by a member takes part normally; someone joining by link starts with Skip (S7).
      await addToOpenSheets(tx, sheets, m!.id, 'none')
      await logActivity(tx, { hisaabId: id, actorUserId: c.var.user.id, kind: 'placeholder_add', payload: { name } })
      return m!.id
    })
    return c.json({ id: memberId }, 201)
  })

  .post('/hisaabs/:id/members/:mid/approve', async (c) => {
    const { id, mid } = c.req.param()
    await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      const sheets = await lockSheets(tx, id)
      const target = await loadMember(tx, id, mid)
      if (target.status !== 'pending') throw badRequest('This person is not waiting for approval.')
      await tx.update(member).set({ status: 'active' }).where(eq(member.id, mid))
      await addToOpenSheets(tx, sheets, mid, 'skip') // a claimed placeholder keeps its place (insert is a no-op)
      await logActivity(tx, { hisaabId: id, actorUserId: c.var.user.id, kind: 'member_approve', payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  .delete('/hisaabs/:id/members/:mid', async (c) => {
    const { id, mid } = c.req.param()
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, id, c.var.user.id)
      // Anyone may leave; only the admin removes other people (founder, 2026-09-27).
      if (mid !== me.id && me.role !== 'admin') throw new AppError(403, 'admin_only', 'Only the Hisaab admin can remove members.')
      const sheets = await lockSheets(tx, id)
      const target = await loadMember(tx, id, mid)
      if (target.status !== 'active' && target.status !== 'pending') throw notFound()
      if (target.role === 'admin') {
        const [other] = await tx
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.hisaabId, id), ne(member.id, mid), eq(member.status, 'active'), sql`${member.userId} is not null`))
          .limit(1)
        if (other) throw new AppError(422, 'admin_must_hand_over', 'Hand the admin role to someone else first.')
      }
      const liveSheets = sheets.filter((s) => s.state === 'open' || s.state === 'closed').map((s) => s.id)
      if (liveSheets.length) {
        const [used] = await tx
          .select({ id: entry.id })
          .from(entry)
          .where(and(inArray(entry.sheetId, liveSheets), isNull(entry.deletedAt), or(eq(entry.paidByMemberId, mid), eq(entry.toMemberId, mid))))
          .limit(1)
        if (used) throw new AppError(422, 'member_has_entries', `${target.displayName} has entries in a month that is not settled yet.`)
      }
      const [unpaid] = await tx
        .select({ id: transfer.id })
        .from(transfer)
        .where(and(eq(transfer.hisaabId, id), eq(transfer.status, 'unpaid'), or(eq(transfer.fromMemberId, mid), eq(transfer.toMemberId, mid))))
        .limit(1)
      if (unpaid) throw new AppError(422, 'member_has_unpaid', `${target.displayName} has a payment that is not marked paid yet.`)

      await tx.update(member).set({ status: 'former' }).where(eq(member.id, mid))
      await removeFromOpenSheets(tx, sheets, mid)
      const kind = mid === me.id ? 'member_leave' : 'member_remove'
      await logActivity(tx, { hisaabId: id, actorUserId: c.var.user.id, kind, payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  .post('/hisaabs/:id/admin', json(memberIdSchema), async (c) => {
    const id = c.req.param('id')
    const { memberId } = c.req.valid('json')
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, id, c.var.user.id, { admin: true })
      const target = await loadMember(tx, id, memberId)
      if (target.status !== 'active' || !target.userId || target.id === me.id) throw badRequest('Pick another member who uses the app.')
      await tx.update(member).set({ role: 'member' }).where(eq(member.id, me.id)) // demote first: one-admin index
      await tx.update(member).set({ role: 'admin' }).where(eq(member.id, memberId))
      const [admins] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(member)
        .where(and(eq(member.hisaabId, id), eq(member.role, 'admin')))
      if (admins!.n !== 1) throw new Error(`hisaab ${id} has ${admins!.n} admins`)
      await logActivity(tx, { hisaabId: id, actorUserId: c.var.user.id, kind: 'admin_handover', payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  .post('/hisaabs/:id/members/:mid/unclaim', async (c) => {
    const { id, mid } = c.req.param()
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, id, c.var.user.id, { admin: true })
      const sheets = await lockSheets(tx, id)
      const target = await loadMember(tx, id, mid)
      if (!target.userId || target.id === me.id || (target.status !== 'active' && target.status !== 'pending')) {
        throw badRequest('Only a claimed member can be undone.')
      }
      await tx.update(member).set({ userId: null, status: 'active' }).where(eq(member.id, mid))
      await bumpOpenSheets(tx, sheets)
      await logActivity(tx, { hisaabId: id, actorUserId: c.var.user.id, kind: 'member_unclaim', payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  // Admin: "this member is really that placeholder". The placeholder keeps its place (seq) and takes over the user.
  .post('/hisaabs/:id/members/:mid/merge', json(mergeSchema), async (c) => {
    const { id, mid } = c.req.param()
    const { placeholderId } = c.req.valid('json')
    await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      const sheets = await lockSheets(tx, id)
      const person = await loadMember(tx, id, mid)
      const placeholder = await loadMember(tx, id, placeholderId)
      if (!person.userId || person.status !== 'active') throw badRequest('Pick a member who uses the app.')
      if (placeholder.userId || placeholder.status !== 'active') throw badRequest('Pick a name nobody has claimed yet.')
      // ponytail: merge only while the person has taken part in Open sheets only; merging into closed
      // snapshots needs a snapshot rewrite. Reopen those months first. Upgrade if families hit this.
      const closedIds = sheets.filter((s) => s.state !== 'open').map((s) => s.id)
      if (closedIds.length) {
        const [inClosed] = await tx
          .select({ id: sheetParticipant.sheetId })
          .from(sheetParticipant)
          .where(and(eq(sheetParticipant.memberId, mid), inArray(sheetParticipant.sheetId, closedIds)))
          .limit(1)
        if (inClosed) throw new AppError(422, 'merge_closed', `${person.displayName} is part of a closed month. Reopen it first.`)
      }
      await tx.update(entry).set({ paidByMemberId: placeholderId }).where(eq(entry.paidByMemberId, mid))
      await tx.update(entry).set({ toMemberId: placeholderId }).where(eq(entry.toMemberId, mid))
      // Money between the two is now money to oneself: dropped (S3).
      await tx
        .update(entry)
        .set({ deletedAt: new Date() })
        .where(and(eq(entry.type, 'money_given'), eq(entry.paidByMemberId, placeholderId), eq(entry.toMemberId, placeholderId)))
      const theirRows = await tx.select().from(sheetParticipant).where(eq(sheetParticipant.memberId, mid))
      for (const r of theirRows) {
        await tx
          .insert(sheetParticipant)
          .values({ ...r, memberId: placeholderId })
          .onConflictDoNothing()
      }
      await tx.delete(sheetParticipant).where(eq(sheetParticipant.memberId, mid))
      await tx.delete(member).where(eq(member.id, mid))
      await tx.update(member).set({ userId: person.userId }).where(eq(member.id, placeholderId))
      await bumpOpenSheets(tx, sheets)
      await logActivity(tx, {
        hisaabId: id,
        actorUserId: c.var.user.id,
        kind: 'member_merge',
        payload: { name: person.displayName, into: placeholder.displayName },
      })
    })
    return c.json({ ok: true })
  })

  .get('/join/:token', async (c) => {
    const h = await findByInvite(c.req.param('token'))
    const members = await db.select().from(member).where(eq(member.hisaabId, h.id)).orderBy(asc(member.seq))
    const mine = members.find((m) => m.userId === c.var.user.id)
    return c.json({
      hisaabId: h.id,
      name: h.name,
      myStatus: mine?.status ?? null,
      placeholders: members.filter((m) => m.userId === null && m.status === 'active').map((m) => ({ id: m.id, name: m.displayName })),
    })
  })

  .post('/join/:token', json(joinSchema), async (c) => {
    const h = await findByInvite(c.req.param('token'))
    const { placeholderId } = c.req.valid('json')
    const user = c.var.user
    const status = await db.transaction(async (tx) => {
      await ensureSheets(tx, h)
      const sheets = await lockSheets(tx, h.id)
      const [existing] = await tx
        .select()
        .from(member)
        .where(and(eq(member.hisaabId, h.id), eq(member.userId, user.id)))
      if (existing && existing.status !== 'former') return existing.status
      const newStatus = h.joinApproval ? ('pending' as const) : ('active' as const)

      if (placeholderId) {
        if (existing) throw badRequest('You were a member before, so join as yourself.')
        const [claimed] = await tx
          .update(member)
          .set({ userId: user.id, status: newStatus })
          .where(and(eq(member.id, placeholderId), eq(member.hisaabId, h.id), isNull(member.userId), eq(member.status, 'active')))
          .returning()
        if (!claimed) throw badRequest('Someone already claimed this name. Pick another or join as new.')
        await bumpOpenSheets(tx, sheets)
        await logActivity(tx, { hisaabId: h.id, actorUserId: user.id, kind: 'member_claim', payload: { name: claimed.displayName } })
        return newStatus
      }

      const [m] = existing
        ? await tx.update(member).set({ status: newStatus }).where(eq(member.id, existing.id)).returning()
        : await tx.insert(member).values({ hisaabId: h.id, userId: user.id, displayName: user.name, status: newStatus }).returning()
      if (newStatus === 'active') await addToOpenSheets(tx, sheets, m!.id, 'skip')
      await logActivity(tx, { hisaabId: h.id, actorUserId: user.id, kind: 'member_join', payload: { name: m!.displayName } })
      return newStatus
    })
    return c.json({ hisaabId: h.id, status })
  })
