// Groups, members, invite and join, funds, group settings.
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { addMonths, monthOf, sheetName } from '../../domain/group.ts'
import {
  addPlaceholderSchema,
  createFundSchema,
  createGroupSchema,
  joinSchema,
  memberIdSchema,
  memberSettingsSchema,
  mergeSchema,
  updateGroupSchema,
} from '../../shared/schemas.ts'
import { expense, expensePayer, expenseShare, fund, group, member, payment, sheet, sheetParticipant, statementToken, type Tx } from '../db.ts'
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
  loadGroup,
  lockGroup,
  logActivity,
  notFound,
  removeFromOpenSheets,
  requireMember,
  tokenFor,
  type Env,
} from '../core.ts'
import { groupBalances } from './payment.ts'

const inviteLink = (nonce: string | null) => (nonce ? `${appUrl()}/join/${tokenFor('invite', nonce)}` : null)

async function loadMember(tx: Tx, groupId: string, memberId: string) {
  const [m] = await tx
    .select()
    .from(member)
    .where(and(eq(member.groupId, groupId), eq(member.id, memberId)))
  if (!m) throw notFound()
  return m
}

async function findByInvite(token: string) {
  const [g] = await db.select().from(group).where(eq(group.inviteTokenHash, hashToken(token)))
  if (!g) throw new AppError(404, 'invite_invalid', 'This invite link is not valid. It may have been replaced by a new one.')
  return g
}

/** Fund balances: money in − bills paid from the fund, over all time (never stored). */
async function fundsOf(groupId: string) {
  const rows = await db
    .select({
      id: fund.id,
      name: fund.name,
      holderMemberId: fund.holderMemberId,
      inPaise: sql<number>`coalesce(sum(case when ${expense.kind} = 'fund_in' then ${expense.amountPaise} else 0 end), 0)`.mapWith(Number),
      usedPaise: sql<number>`coalesce(sum(case when ${expense.kind} = 'expense' then ${expense.amountPaise} else 0 end), 0)`.mapWith(Number),
    })
    .from(fund)
    .leftJoin(expense, and(eq(expense.fundId, fund.id), isNull(expense.deletedAt)))
    .where(eq(fund.groupId, groupId))
    .groupBy(fund.id)
    .orderBy(asc(fund.createdAt))
  return rows.map((f) => ({ ...f, balancePaise: f.inPaise - f.usedPaise }))
}

type MonthStats = { totalPaise: number; entryCount: number }

/** Per-month numbers for lists: bills − refunds (fund money excluded from neither), and entry count. */
async function monthStats(sheetIds: string[]): Promise<(id: string) => MonthStats> {
  const empty: MonthStats = { totalPaise: 0, entryCount: 0 }
  if (!sheetIds.length) return () => empty
  const sums = await db
    .select({
      sheetId: expense.sheetId,
      totalPaise: sql<number>`coalesce(sum(case when ${expense.kind} = 'expense' then ${expense.amountPaise} when ${expense.kind} = 'refund' then -${expense.amountPaise} else 0 end), 0)`.mapWith(Number),
      entryCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(expense)
    .where(and(inArray(expense.sheetId, sheetIds), isNull(expense.deletedAt), ne(expense.kind, 'sheet_close')))
    .groupBy(expense.sheetId)
  return (id) => ({ ...empty, ...sums.find((x) => x.sheetId === id) })
}

export const groupRoutes = new Hono<Env>()
  .get('/groups', async (c) => {
    const rows = await db
      .select({ id: group.id, name: group.name, settleMode: group.settleMode, role: member.role, status: member.status, memberId: member.id })
      .from(member)
      .innerJoin(group, eq(group.id, member.groupId))
      .where(and(eq(member.userId, c.var.user.id), ne(member.status, 'deleted')))
      .orderBy(asc(group.name))
    const visible = rows.filter((r) => r.status === 'active')
    const counts = visible.length
      ? await db
          .select({ groupId: member.groupId, n: sql<number>`count(*)`.mapWith(Number) })
          .from(member)
          .where(and(inArray(member.groupId, visible.map((r) => r.id)), inArray(member.status, ['active', 'pending'])))
          .groupBy(member.groupId)
      : []
    const nets = new Map<string, number>()
    for (const r of visible) {
      const b = await groupBalances(db, r.id)
      nets.set(r.id, b.members.find((m) => m.memberId === r.memberId)?.netPaise ?? 0)
    }
    return c.json({
      groups: rows.map(({ memberId: _m, ...r }) => ({ ...r, memberCount: counts.find((x) => x.groupId === r.id)?.n ?? 0, myNetPaise: nets.get(r.id) ?? 0 })),
    })
  })

  .post('/groups', json(createGroupSchema), async (c) => {
    const input = c.req.valid('json')
    const thisMonth = monthOf(clock.today())
    const startMonth = input.startMonth ?? thisMonth
    if (startMonth > thisMonth || startMonth < addMonths(thisMonth, -12)) {
      throw badRequest('The start month must be this month or up to 12 months back.')
    }
    const id = await db.transaction(async (tx) => {
      const [g] = await tx
        .insert(group)
        .values({ name: input.name, settleMode: input.settleMode, category: input.category, startMonth, createdBy: c.var.user.id })
        .returning()
      await tx.insert(member).values([
        { groupId: g!.id, userId: c.var.user.id, displayName: c.var.user.name, role: 'admin' as const },
        ...input.members.map((name) => ({ groupId: g!.id, displayName: name })),
      ])
      await ensureSheets(tx, g!)
      await logActivity(tx, { groupId: g!.id, actorUserId: c.var.user.id, kind: 'group_create', payload: { name: g!.name } })
      return g!.id
    })
    return c.json({ id }, 201)
  })

  .get('/groups/:id', async (c) => {
    const g = await loadGroup(db, c.req.param('id'))
    const me = await requireMember(db, g.id, c.var.user.id, { pending: true, former: true })
    if (me.status === 'pending') return c.json({ id: g.id, name: g.name, pending: true as const })
    if (me.status === 'active') await db.transaction((tx) => ensureSheets(tx, g))

    const [members, balances, funds] = await Promise.all([
      db.select().from(member).where(eq(member.groupId, g.id)).orderBy(asc(member.seq)),
      groupBalances(db, g.id),
      fundsOf(g.id),
    ])
    let sheetsQuery = db
      .select({ id: sheet.id, month: sheet.month, startDate: sheet.startDate, endDate: sheet.endDate, state: sheet.state, version: sheet.version })
      .from(sheet)
      .where(eq(sheet.groupId, g.id))
      .$dynamic()
    if (me.status === 'former') {
      sheetsQuery = sheetsQuery.innerJoin(sheetParticipant, and(eq(sheetParticipant.sheetId, sheet.id), eq(sheetParticipant.memberId, me.id)))
    }
    const sheets = await sheetsQuery.orderBy(desc(sheet.startDate))
    const stats = await monthStats(sheets.map((s) => s.id))
    const net = new Map(balances.members.map((m) => [m.memberId, m.netPaise]))

    return c.json({
      id: g.id,
      name: g.name,
      settleMode: g.settleMode,
      category: g.category,
      joinApproval: g.joinApproval,
      pending: false as const,
      me: { memberId: me.id, role: me.role, status: me.status },
      inviteLink: me.status === 'active' ? inviteLink(g.inviteNonce) : null,
      members: members
        .filter((m) => m.status !== 'former' || m.id === me.id || net.get(m.id) !== 0)
        .map((m) => ({
          id: m.id,
          name: m.displayName,
          role: m.role,
          status: m.status,
          placeholder: m.userId === null && m.status === 'active',
          isMe: m.id === me.id,
          defaultWeight: m.defaultWeight,
          netPaise: net.get(m.id) ?? 0,
        })),
      plan: balances.plan,
      funds,
      sheets: sheets.map((s) => ({ ...s, name: sheetName(s.month), ...stats(s.id) })),
    })
  })

  .patch('/groups/:id', json(updateGroupSchema), async (c) => {
    const id = c.req.param('id')
    const input = c.req.valid('json')
    await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      const { g, sheets } = await lockGroup(tx, id)
      let startMonth = g.startMonth
      if (input.settleMode && input.settleMode !== g.settleMode) {
        if (input.settleMode === 'as_you_go') {
          const open = sheets.filter((s) => s.state === 'open').map((s) => s.id)
          const [waiting] = open.length
            ? await tx
                .select({ id: expense.id })
                .from(expense)
                .where(and(inArray(expense.sheetId, open), isNull(expense.deletedAt), eq(expense.splitMode, 'sheet')))
                .limit(1)
            : []
          if (waiting) throw new AppError(422, 'month_open', 'Close the open month first. Its bills are divided at month end.')
          // Open months with nothing to divide are dropped; their other entries stay as they are.
          for (const s of sheets.filter((x) => x.state === 'open')) {
            await tx.update(expense).set({ sheetId: null }).where(eq(expense.sheetId, s.id))
            await tx.delete(sheetParticipant).where(eq(sheetParticipant.sheetId, s.id))
            await tx.delete(statementToken).where(eq(statementToken.sheetId, s.id))
            await tx.delete(sheet).where(eq(sheet.id, s.id))
          }
        } else {
          // Monthly from now on: the first month is this month (or the month after the last closed one).
          const lastClosed = sheets.filter((s) => s.state === 'closed').at(-1)
          startMonth = lastClosed ? addMonths(lastClosed.month, 1) : monthOf(clock.today())
        }
      }
      const [updated] = await tx
        .update(group)
        .set({ name: input.name, settleMode: input.settleMode, joinApproval: input.joinApproval, startMonth })
        .where(eq(group.id, id))
        .returning()
      await ensureSheets(tx, updated!)
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'group_edit', payload: input })
    })
    return c.json({ ok: true })
  })

  .post('/groups/:id/invite', async (c) => {
    const id = c.req.param('id')
    await requireMember(db, id, c.var.user.id)
    const nonce = randomUUID()
    await db
      .update(group)
      .set({ inviteNonce: nonce, inviteTokenHash: hashToken(tokenFor('invite', nonce)) })
      .where(eq(group.id, id))
    return c.json({ link: inviteLink(nonce)! })
  })

  .post('/groups/:id/members', json(addPlaceholderSchema), async (c) => {
    const id = c.req.param('id')
    const { name } = c.req.valid('json')
    const memberId = await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      await ensureSheets(tx, await loadGroup(tx, id))
      const { sheets } = await lockGroup(tx, id)
      const [count] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(member).where(eq(member.groupId, id))
      if (count!.n >= 100) throw badRequest('A group can have at most 100 members.')
      const [m] = await tx.insert(member).values({ groupId: id, displayName: name }).returning()
      // A person added by a member takes part normally; someone joining by link starts with Skip.
      await addToOpenSheets(tx, sheets, m!.id, 'none')
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'placeholder_add', payload: { name } })
      return m!.id
    })
    return c.json({ id: memberId }, 201)
  })

  .patch('/groups/:id/members/:mid', json(memberSettingsSchema), async (c) => {
    const { id, mid } = c.req.param()
    const { defaultWeight } = c.req.valid('json')
    await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id)
      await lockGroup(tx, id)
      const target = await loadMember(tx, id, mid)
      await tx.update(member).set({ defaultWeight }).where(eq(member.id, target.id))
    })
    return c.json({ ok: true })
  })

  .post('/groups/:id/members/:mid/approve', async (c) => {
    const { id, mid } = c.req.param()
    await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      const { sheets } = await lockGroup(tx, id)
      const target = await loadMember(tx, id, mid)
      if (target.status !== 'pending') throw badRequest('This person is not waiting for approval.')
      await tx.update(member).set({ status: 'active' }).where(eq(member.id, mid))
      await addToOpenSheets(tx, sheets, mid, 'skip') // a claimed placeholder keeps its place (insert is a no-op)
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'member_approve', payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  .delete('/groups/:id/members/:mid', async (c) => {
    const { id, mid } = c.req.param()
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, id, c.var.user.id)
      // Anyone may leave; only the admin removes other people.
      if (mid !== me.id && me.role !== 'admin') throw new AppError(403, 'admin_only', 'Only the group admin can remove members.')
      const { sheets } = await lockGroup(tx, id)
      const target = await loadMember(tx, id, mid)
      if (target.status !== 'active' && target.status !== 'pending') throw notFound()
      if (target.role === 'admin') {
        const [other] = await tx
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.groupId, id), ne(member.id, mid), eq(member.status, 'active'), sql`${member.userId} is not null`))
          .limit(1)
        if (other) throw new AppError(422, 'admin_must_hand_over', 'Hand the admin role to someone else first.')
      }
      const balance = (await groupBalances(tx, id)).members.find((m) => m.memberId === mid)
      if (balance && balance.netPaise !== 0) throw new AppError(422, 'member_has_balance', `${target.displayName} still owes or is owed money. Settle up first.`)
      const open = sheets.filter((s) => s.state === 'open').map((s) => s.id)
      if (open.length) {
        const [used] = await tx
          .select({ id: expensePayer.expenseId })
          .from(expensePayer)
          .innerJoin(expense, eq(expense.id, expensePayer.expenseId))
          .where(and(inArray(expense.sheetId, open), isNull(expense.deletedAt), eq(expensePayer.memberId, mid)))
          .limit(1)
        if (used) throw new AppError(422, 'member_has_entries', `${target.displayName} paid bills in a month that is not closed yet.`)
      }

      await tx.update(member).set({ status: 'former' }).where(eq(member.id, mid))
      await removeFromOpenSheets(tx, sheets, mid)
      const kind = mid === me.id ? 'member_leave' : 'member_remove'
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind, payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  .post('/groups/:id/admin', json(memberIdSchema), async (c) => {
    const id = c.req.param('id')
    const { memberId } = c.req.valid('json')
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, id, c.var.user.id, { admin: true })
      const target = await loadMember(tx, id, memberId)
      if (target.status !== 'active' || !target.userId || target.id === me.id) throw badRequest('Pick another member who uses the app.')
      await tx.update(member).set({ role: 'member' }).where(eq(member.id, me.id)) // demote first: one-admin index
      await tx.update(member).set({ role: 'admin' }).where(eq(member.id, memberId))
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'admin_handover', payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  .post('/groups/:id/members/:mid/unclaim', async (c) => {
    const { id, mid } = c.req.param()
    await db.transaction(async (tx) => {
      const me = await requireMember(tx, id, c.var.user.id, { admin: true })
      const { sheets } = await lockGroup(tx, id)
      const target = await loadMember(tx, id, mid)
      if (!target.userId || target.id === me.id || (target.status !== 'active' && target.status !== 'pending')) {
        throw badRequest('Only a claimed member can be undone.')
      }
      await tx.update(member).set({ userId: null, status: 'active' }).where(eq(member.id, mid))
      await bumpOpenSheets(tx, sheets)
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'member_unclaim', payload: { name: target.displayName } })
    })
    return c.json({ ok: true })
  })

  // Admin: "this member is really that placeholder". The placeholder keeps its place (seq) and takes over the user.
  .post('/groups/:id/members/:mid/merge', json(mergeSchema), async (c) => {
    const { id, mid } = c.req.param()
    const { placeholderId } = c.req.valid('json')
    await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id, { admin: true })
      const { sheets } = await lockGroup(tx, id)
      const person = await loadMember(tx, id, mid)
      const placeholder = await loadMember(tx, id, placeholderId)
      if (!person.userId || person.status !== 'active') throw badRequest('Pick a member who uses the app.')
      if (placeholder.userId || placeholder.status !== 'active') throw badRequest('Pick a name nobody has claimed yet.')
      // shortcut: refuse when both are on the same expense (their rows would need adding together); upgrade if groups hit this
      const both = sql`select ${expensePayer.expenseId} from ${expensePayer} where ${expensePayer.memberId} in (${mid}, ${placeholderId})
        group by 1 having count(*) > 1
        union all select ${expenseShare.expenseId} from ${expenseShare} where ${expenseShare.memberId} in (${mid}, ${placeholderId})
        group by 1 having count(*) > 1 limit 1`
      const clash = await tx.execute(both)
      if (clash.rows.length) throw new AppError(422, 'merge_shared', `${person.displayName} and ${placeholder.displayName} are on the same expense. Edit it first.`)

      await tx.update(expensePayer).set({ memberId: placeholderId }).where(eq(expensePayer.memberId, mid))
      await tx.update(expenseShare).set({ memberId: placeholderId }).where(eq(expenseShare.memberId, mid))
      // Money between the two is now money to oneself: dropped.
      await tx
        .update(payment)
        .set({ deletedAt: new Date() })
        .where(
          or(
            and(eq(payment.fromMemberId, mid), eq(payment.toMemberId, placeholderId)),
            and(eq(payment.fromMemberId, placeholderId), eq(payment.toMemberId, mid)),
          ),
        )
      await tx.update(payment).set({ fromMemberId: placeholderId }).where(eq(payment.fromMemberId, mid))
      await tx.update(payment).set({ toMemberId: placeholderId }).where(eq(payment.toMemberId, mid))
      await tx.update(fund).set({ holderMemberId: placeholderId }).where(eq(fund.holderMemberId, mid))
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
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'member_merge', payload: { name: person.displayName, into: placeholder.displayName } })
    })
    return c.json({ ok: true })
  })

  .post('/groups/:id/funds', json(createFundSchema), async (c) => {
    const id = c.req.param('id')
    const { name, holderMemberId } = c.req.valid('json')
    const fundId = await db.transaction(async (tx) => {
      await requireMember(tx, id, c.var.user.id)
      await lockGroup(tx, id)
      if (holderMemberId) {
        const holder = await loadMember(tx, id, holderMemberId)
        if (holder.status !== 'active') throw badRequest('Pick a current member to hold the money.')
      }
      const [count] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(fund).where(eq(fund.groupId, id))
      if (count!.n >= 10) throw badRequest('A group can have at most 10 funds.')
      const [f] = await tx.insert(fund).values({ groupId: id, name, holderMemberId }).returning()
      await logActivity(tx, { groupId: id, actorUserId: c.var.user.id, kind: 'fund_create', payload: { name } })
      return f!.id
    })
    return c.json({ id: fundId }, 201)
  })

  .get('/join/:token', async (c) => {
    const g = await findByInvite(c.req.param('token'))
    const members = await db.select().from(member).where(eq(member.groupId, g.id)).orderBy(asc(member.seq))
    const mine = members.find((m) => m.userId === c.var.user.id)
    return c.json({
      groupId: g.id,
      name: g.name,
      myStatus: mine?.status ?? null,
      placeholders: members.filter((m) => m.userId === null && m.status === 'active').map((m) => ({ id: m.id, name: m.displayName })),
    })
  })

  .post('/join/:token', json(joinSchema), async (c) => {
    const g = await findByInvite(c.req.param('token'))
    const { placeholderId } = c.req.valid('json')
    const user = c.var.user
    const status = await db.transaction(async (tx) => {
      await ensureSheets(tx, g)
      const { sheets } = await lockGroup(tx, g.id)
      const [existing] = await tx
        .select()
        .from(member)
        .where(and(eq(member.groupId, g.id), eq(member.userId, user.id)))
      if (existing && existing.status !== 'former') return existing.status
      const newStatus = g.joinApproval ? ('pending' as const) : ('active' as const)

      if (placeholderId) {
        if (existing) throw badRequest('You were a member before, so join as yourself.')
        const [claimed] = await tx
          .update(member)
          .set({ userId: user.id, status: newStatus })
          .where(and(eq(member.id, placeholderId), eq(member.groupId, g.id), isNull(member.userId), eq(member.status, 'active')))
          .returning()
        if (!claimed) throw badRequest('Someone already claimed this name. Pick another or join as new.')
        await bumpOpenSheets(tx, sheets)
        await logActivity(tx, { groupId: g.id, actorUserId: user.id, kind: 'member_claim', payload: { name: claimed.displayName } })
        return newStatus
      }

      const [m] = existing
        ? await tx.update(member).set({ status: newStatus }).where(eq(member.id, existing.id)).returning()
        : await tx.insert(member).values({ groupId: g.id, userId: user.id, displayName: user.name, status: newStatus }).returning()
      if (newStatus === 'active') await addToOpenSheets(tx, sheets, m!.id, 'skip')
      await logActivity(tx, { groupId: g.id, actorUserId: user.id, kind: 'member_join', payload: { name: m!.displayName } })
      return newStatus
    })
    return c.json({ groupId: g.id, status })
  })

