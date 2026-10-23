// Expenses (payers + per-expense split), months of monthly groups (exceptions, close, reopen), statement links.
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import {
  CLOSE_ORDER_TEXT,
  SPLIT_BLOCKED_TEXT,
  addMonths,
  buildShares,
  checkCanClose,
  closeSheet,
  placeEntry,
  shareText,
  sheetName,
  type CloseResult,
  type Participant,
  type SheetEntry,
  type ShareRow,
  type SplitMode,
} from '../../domain/group.ts'
import { MAX_ENTRIES_PER_SHEET } from '../../domain/money.ts'
import { createExpenseSchema, participantSchema, updateExpenseSchema, versionSchema } from '../../shared/schemas.ts'
import { expense, expensePayer, expenseShare, fund, member, sheet, sheetParticipant, sheetSnapshot, statementToken, type Db, type Tx } from '../db.ts'
import {
  AppError,
  appUrl,
  badRequest,
  bumpVersion,
  clock,
  db,
  ensureSheets,
  hashToken,
  json,
  loadGroup,
  lockGroup,
  logActivity,
  notFound,
  requireMember,
  tokenFor,
  versionConflict,
  type Env,
  type GroupRow,
  type SheetRow,
} from '../core.ts'
import { groupBalances } from './payment.ts'

type Q = Db | Tx
type ExpenseRow = typeof expense.$inferSelect
type ExpenseInput = typeof createExpenseSchema._output

const MAX_EXPENSES_PER_GROUP = 50_000
const SPLIT_MODES: readonly string[] = ['equal', 'exact', 'shares', 'percent', 'adjust'] satisfies SplitMode[]

const closedMonth = () => new AppError(422, 'sheet_not_open', 'This month is closed. Ask the admin to reopen it.')

async function loadSheet(q: Q, id: string) {
  const [s] = await q.select().from(sheet).where(eq(sheet.id, id))
  if (!s) throw notFound()
  return s
}

async function participantsOf(q: Q, sheetId: string) {
  return q
    .select({
      memberId: sheetParticipant.memberId,
      seq: member.seq,
      exception: sheetParticipant.exception,
      exceptionPaise: sheetParticipant.exceptionPaise,
      weight: sheetParticipant.weight,
      name: member.displayName,
      status: member.status,
      hasUser: sql<boolean>`${member.userId} is not null`,
    })
    .from(sheetParticipant)
    .innerJoin(member, eq(member.id, sheetParticipant.memberId))
    .where(eq(sheetParticipant.sheetId, sheetId))
    .orderBy(asc(member.seq))
}

/** Expenses with their payers and shares, in the order given. */
export async function withSplits(q: Q, rows: ExpenseRow[]) {
  const ids = rows.map((e) => e.id)
  const [payers, shares] = ids.length
    ? await Promise.all([
        q.select().from(expensePayer).where(inArray(expensePayer.expenseId, ids)),
        q.select().from(expenseShare).where(inArray(expenseShare.expenseId, ids)),
      ])
    : [[], []]
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    amountPaise: e.amountPaise,
    category: e.category,
    date: e.date,
    note: e.note,
    fundId: e.fundId,
    sheetId: e.sheetId,
    splitMode: e.splitMode,
    version: e.version,
    createdAt: e.createdAt,
    payers: payers.filter((p) => p.expenseId === e.id).map((p) => ({ memberId: p.memberId, paidPaise: p.paidPaise })),
    shares: shares
      .filter((s) => s.expenseId === e.id)
      .map((s) => ({ memberId: s.memberId, exception: s.exception, exceptionPaise: s.exceptionPaise, weight: s.weight, owedPaise: s.owedPaise })),
  }))
}

type ExpenseView = Awaited<ReturnType<typeof withSplits>>[number]

/** The month-close input: bills divided at close, plus fund money. Custom-split expenses are already split. */
const closeInput = (rows: ExpenseView[]): SheetEntry[] =>
  rows
    .filter((e) => e.kind !== 'sheet_close' && (e.splitMode === 'sheet' || e.fundId !== null))
    .map((e) => ({ kind: e.kind as SheetEntry['kind'], amountPaise: e.amountPaise, category: e.category, fundId: e.fundId, payers: e.payers }))

async function sheetExpenses(q: Q, sheetId: string) {
  const rows = await q
    .select()
    .from(expense)
    .where(and(eq(expense.sheetId, sheetId), isNull(expense.deletedAt), ne(expense.kind, 'sheet_close')))
    .orderBy(asc(expense.date), asc(expense.createdAt))
  return withSplits(q, rows)
}

/** What a month shows: live preview while Open, the close snapshot afterwards. */
export async function sheetData(q: Q, s: SheetRow) {
  const g = await loadGroup(q, s.groupId)
  const [participants, entries, members, funds] = await Promise.all([
    participantsOf(q, s.id),
    sheetExpenses(q, s.id),
    q.select({ id: member.id, name: member.displayName }).from(member).where(eq(member.groupId, s.groupId)),
    q.select({ id: fund.id, name: fund.name }).from(fund).where(eq(fund.groupId, s.groupId)),
  ])
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]))
  const recomputed = closeSheet(participants as Participant[], closeInput(entries))
  let result: CloseResult | { ok: false; reason: string; message: string }
  if (s.state === 'open') {
    result = recomputed.ok ? recomputed : { ...recomputed, message: SPLIT_BLOCKED_TEXT[recomputed.reason] }
  } else {
    const [snap] = await q.select().from(sheetSnapshot).where(eq(sheetSnapshot.sheetId, s.id))
    result = snap!.data as CloseResult
    if (!isDeepStrictEqual(recomputed, result)) {
      console.error(JSON.stringify({ level: 'error', msg: 'snapshot differs from recompute', sheetId: s.id }))
    }
  }
  return {
    group: { id: g.id, name: g.name },
    sheet: { id: s.id, name: sheetName(s.month), month: s.month, startDate: s.startDate, endDate: s.endDate, state: s.state, version: s.version },
    names,
    fundNames: Object.fromEntries(funds.map((f) => [f.id, f.name])),
    participants: participants.map(({ memberId, name, exception, exceptionPaise, status, hasUser }) => ({ memberId, name, exception, exceptionPaise, status, hasUser })),
    entries: entries.map((e) => ({ ...e, late: e.date < s.startDate || e.date > s.endDate })),
    result,
  }
}

const statementLink = (statementId: string) => `${appUrl()}/s/${tokenFor('statement', statementId)}`

async function activeStatement(q: Q, sheetId: string) {
  const [row] = await q
    .select({ id: statementToken.id })
    .from(statementToken)
    .where(and(eq(statementToken.sheetId, sheetId), isNull(statementToken.revokedAt)))
    .limit(1)
  return row ? { id: row.id, link: statementLink(row.id) } : null
}

async function share(data: Awaited<ReturnType<typeof sheetData>>, link: string) {
  if (!data.result.ok || data.sheet.state === 'open') return null
  const { plan } = await groupBalances(db, data.group.id)
  const text = shareText({ groupName: data.group.name, sheetName: data.sheet.name, result: data.result, names: data.names, fundNames: data.fundNames, plan, link })
  return { shareText: text, waLink: `https://wa.me/?text=${encodeURIComponent(text)}` }
}

/** Which month an entry goes into (monthly groups). Opens the next month when every month is closed. */
async function targetSheet(tx: Tx, g: GroupRow, sheets: SheetRow[], date: string) {
  const placed = placeEntry({ date, today: clock.today(), sheets })
  if (!placed.ok) {
    throw badRequest(placed.reason === 'future' ? "The date can't be in the future." : `This group starts on ${g.startMonth}.`, placed.reason)
  }
  if (placed.sheetId) return placed.sheetId
  const next = addMonths(sheets.at(-1)!.month, 1)
  await ensureSheets(tx, g, next)
  const [created] = await tx
    .select({ id: sheet.id })
    .from(sheet)
    .where(and(eq(sheet.groupId, g.id), eq(sheet.month, next)))
  return created!.id
}

/**
 * Check an expense against its group and work out where it goes and who owes what.
 * Every person named must be an active member; month-close bills need payers who take part in that month.
 */
async function prepare(tx: Tx, g: GroupRow, sheets: SheetRow[], input: Omit<ExpenseInput, 'id'>) {
  const { kind, fundId, payers, split, splitMode, category, amountPaise } = input
  const fail = (message: string): never => {
    throw badRequest(message)
  }
  if (fundId) {
    const [f] = await tx.select({ id: fund.id }).from(fund).where(and(eq(fund.id, fundId), eq(fund.groupId, g.id)))
    if (!f) fail('That fund is not part of this group.')
  }
  if (kind === 'fund_in') {
    if (!fundId || payers.length || split.length || splitMode !== 'none' || category !== null) fail('Money in needs a fund, an amount and a date.')
  } else if (fundId) {
    if (kind !== 'expense' || payers.length || split.length || splitMode !== 'none') fail('A bill paid from a fund is not split.')
    if (category === null) fail('Pick a category.')
  } else {
    if (category === null) fail('Pick a category.')
    if (!payers.length) fail(kind === 'refund' ? 'Pick who got the money back.' : 'Pick who paid.')
    if (new Set(payers.map((p) => p.memberId)).size !== payers.length) fail('A person is listed as paying twice.')
    if (payers.reduce((s, p) => s + p.paidPaise, 0) !== amountPaise) fail('What each person paid must add up to the total.')
    if (splitMode === 'none') fail('Pick how to split it.')
    if (splitMode === 'sheet') {
      if (g.settleMode !== 'monthly') fail('This group splits as you go. Pick how to split it.')
      if (split.length) fail('A bill divided at month end has no split yet.')
    }
  }

  let sheetId: string | null = null
  let late = false
  if (g.settleMode === 'monthly') {
    sheetId = await targetSheet(tx, g, sheets, input.date)
    late = sheets.some((s) => s.id !== sheetId && s.startDate <= input.date && input.date <= s.endDate)
  } else if (input.date > clock.today()) {
    fail("The date can't be in the future.")
  }

  const members = await tx
    .select({ id: member.id, seq: member.seq, status: member.status })
    .from(member)
    .where(eq(member.groupId, g.id))
  const active = new Map(members.filter((m) => m.status === 'active').map((m) => [m.id, m.seq]))
  for (const id of [...payers.map((p) => p.memberId), ...split.map((p) => p.memberId)]) {
    if (!active.has(id)) fail('Someone in this expense is not a member of the group.')
  }
  if (splitMode === 'sheet' && sheetId) {
    const inMonth = new Set((await participantsOf(tx, sheetId)).map((p) => p.memberId))
    if (payers.some((p) => !inMonth.has(p.memberId))) fail('That person is not part of this month.')
  }

  let shares: ShareRow[] = []
  if (SPLIT_MODES.includes(splitMode)) {
    const built = buildShares({ mode: splitMode as SplitMode, amountPaise, people: split, seqOf: (id) => active.get(id)!, payers })
    if (!built.ok) fail(built.message)
    else shares = built.shares
  }
  return { sheetId, late, shares }
}

async function writeSplits(tx: Tx, expenseId: string, payers: ExpenseInput['payers'], shares: ShareRow[]) {
  if (payers.length) await tx.insert(expensePayer).values(payers.map((p) => ({ expenseId, ...p })))
  if (shares.length) await tx.insert(expenseShare).values(shares.map((s) => ({ expenseId, ...s })))
}

async function loadLiveExpense(id: string) {
  const [e] = await db.select().from(expense).where(and(eq(expense.id, id), isNull(expense.deletedAt), ne(expense.kind, 'sheet_close')))
  if (!e) throw notFound()
  return e
}

/** An expense changes only while its month is open (as-you-go expenses have no month). */
async function assertEditable(tx: Tx, sheets: SheetRow[], e: ExpenseRow, version: number) {
  const [row] = await tx
    .update(expense)
    .set({ version: sql`${expense.version} + 1` })
    .where(and(eq(expense.id, e.id), eq(expense.version, version)))
    .returning()
  if (!row) throw versionConflict()
  if (e.sheetId) {
    if (sheets.find((s) => s.id === e.sheetId)?.state !== 'open') throw closedMonth()
    await bumpVersion(tx, e.sheetId)
  }
}

const activityPayload = (e: { kind: string; amountPaise: number; note: string; category: string | null }) => ({
  kind: e.kind,
  amountPaise: e.amountPaise,
  note: e.note.slice(0, 60),
  category: e.category,
})

export const expenseRoutes = new Hono<Env>()
  .get('/groups/:id/expenses', async (c) => {
    const groupId = c.req.param('id')
    await requireMember(db, groupId, c.var.user.id, { former: true })
    // shortcut: newest 300 only, add paging when a group passes that
    const rows = await db
      .select()
      .from(expense)
      .where(and(eq(expense.groupId, groupId), isNull(expense.deletedAt), ne(expense.kind, 'sheet_close')))
      .orderBy(desc(expense.date), desc(expense.createdAt))
      .limit(300)
    return c.json({ expenses: await withSplits(db, rows) })
  })

  .post('/groups/:id/expenses', json(createExpenseSchema), async (c) => {
    const { id, ...input } = c.req.valid('json')
    const user = c.var.user
    const groupId = c.req.param('id')
    const out = await db.transaction(async (tx) => {
      await requireMember(tx, groupId, user.id)
      const g = await loadGroup(tx, groupId)
      await ensureSheets(tx, g)
      const { sheets } = await lockGroup(tx, groupId)
      const [dup] = await tx.select().from(expense).where(eq(expense.id, id))
      if (dup) {
        if (dup.groupId !== groupId) throw notFound()
        return { id: dup.id, sheetId: dup.sheetId, created: false } // double tap: same row
      }
      const { sheetId, shares } = await prepare(tx, g, sheets, input)
      const [count] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(expense)
        .where(and(sheetId ? eq(expense.sheetId, sheetId) : eq(expense.groupId, groupId), isNull(expense.deletedAt)))
      if (count!.n >= (sheetId ? MAX_ENTRIES_PER_SHEET : MAX_EXPENSES_PER_GROUP)) throw badRequest('This group has too many expenses.')
      const { payers, split: _split, ...fields } = input
      await tx.insert(expense).values({ ...fields, id, groupId, sheetId, createdBy: user.id })
      await writeSplits(tx, id, payers, shares)
      if (sheetId) await bumpVersion(tx, sheetId)
      await logActivity(tx, { groupId, sheetId, actorUserId: user.id, kind: 'expense_create', payload: activityPayload(input) })
      return { id, sheetId, created: true }
    })
    return c.json(out, out.created ? 201 : 200)
  })

  .patch('/expenses/:id', json(updateExpenseSchema), async (c) => {
    const { version, ...input } = c.req.valid('json')
    const user = c.var.user
    const e = await loadLiveExpense(c.req.param('id'))
    const out = await db.transaction(async (tx) => {
      await requireMember(tx, e.groupId, user.id)
      const { g, sheets } = await lockGroup(tx, e.groupId)
      await assertEditable(tx, sheets, e, version)
      const { sheetId, shares } = await prepare(tx, g, sheets, input)
      if (sheetId && sheetId !== e.sheetId) await bumpVersion(tx, sheetId)
      await tx.delete(expensePayer).where(eq(expensePayer.expenseId, e.id))
      await tx.delete(expenseShare).where(eq(expenseShare.expenseId, e.id))
      const { payers, split: _split, ...fields } = input
      await tx.update(expense).set({ ...fields, sheetId }).where(eq(expense.id, e.id))
      await writeSplits(tx, e.id, payers, shares)
      await logActivity(tx, { groupId: e.groupId, sheetId, actorUserId: user.id, kind: 'expense_edit', payload: activityPayload(input) })
      return { id: e.id, sheetId }
    })
    return c.json(out)
  })

  .delete('/expenses/:id', json(versionSchema), async (c) => {
    const { version } = c.req.valid('json')
    const e = await loadLiveExpense(c.req.param('id'))
    await db.transaction(async (tx) => {
      await requireMember(tx, e.groupId, c.var.user.id)
      const { sheets } = await lockGroup(tx, e.groupId)
      await assertEditable(tx, sheets, e, version)
      await tx.update(expense).set({ deletedAt: new Date() }).where(eq(expense.id, e.id))
      await logActivity(tx, { groupId: e.groupId, sheetId: e.sheetId, actorUserId: c.var.user.id, kind: 'expense_delete', payload: activityPayload(e) })
    })
    return c.json({ ok: true })
  })

  .get('/sheets/:id', async (c) => {
    const s = await loadSheet(db, c.req.param('id'))
    const me = await requireMember(db, s.groupId, c.var.user.id, { former: true })
    if (me.status === 'former') {
      // Former members read only the months they took part in.
      const [took] = await db.select().from(sheetParticipant).where(and(eq(sheetParticipant.sheetId, s.id), eq(sheetParticipant.memberId, me.id)))
      if (!took) throw notFound()
    }
    const data = await sheetData(db, s)
    const statement = me.status === 'active' ? await activeStatement(db, s.id) : null
    return c.json({
      ...data,
      me: { memberId: me.id, role: me.role, status: me.status },
      statement,
      share: statement ? await share(data, statement.link) : null,
    })
  })

  .put('/sheets/:id/participants/:mid', json(participantSchema), async (c) => {
    const { version, exception, exceptionPaise } = c.req.valid('json')
    const s = await loadSheet(db, c.req.param('id'))
    await db.transaction(async (tx) => {
      await requireMember(tx, s.groupId, c.var.user.id)
      await lockGroup(tx, s.groupId)
      const current = await bumpVersion(tx, s.id, version)
      if (current.state !== 'open') throw closedMonth()
      const [row] = await tx
        .update(sheetParticipant)
        .set({ exception, exceptionPaise: exception === 'fixed' || exception === 'extra' ? exceptionPaise : 0 })
        .where(and(eq(sheetParticipant.sheetId, s.id), eq(sheetParticipant.memberId, c.req.param('mid'))))
        .returning()
      if (!row) throw notFound()
    })
    return c.json({ ok: true })
  })

  .post('/sheets/:id/close', json(versionSchema), async (c) => {
    const { version } = c.req.valid('json')
    const s = await loadSheet(db, c.req.param('id'))
    const user = c.var.user
    await db.transaction(async (tx) => {
      await requireMember(tx, s.groupId, user.id)
      const { sheets } = await lockGroup(tx, s.groupId)
      await bumpVersion(tx, s.id, version) // entries are read after this, under the lock
      const orderError = checkCanClose(s.id, sheets)
      if (orderError) throw new AppError(422, orderError, CLOSE_ORDER_TEXT[orderError])
      const participants = await participantsOf(tx, s.id)
      const result = closeSheet(participants as Participant[], closeInput(await sheetExpenses(tx, s.id)))
      if (!result.ok) throw new AppError(422, result.reason, SPLIT_BLOCKED_TEXT[result.reason])

      // The month's obligations become one expense, so balances use one formula for every group.
      if (result.dividablePaise > 0) {
        const closeId = randomUUID()
        const today = clock.today()
        await tx.insert(expense).values({
          id: closeId,
          groupId: s.groupId,
          sheetId: s.id,
          kind: 'sheet_close',
          amountPaise: result.dividablePaise,
          splitMode: 'none',
          category: null,
          date: today < s.endDate ? today : s.endDate,
          note: `${sheetName(s.month)} close`,
          createdBy: user.id,
        })
        const owed = result.members.filter((m) => m.obligationPaise > 0)
        await tx.insert(expenseShare).values(owed.map((m) => ({ expenseId: closeId, memberId: m.memberId, owedPaise: m.obligationPaise })))
      }
      await tx.insert(sheetSnapshot).values({ sheetId: s.id, data: result })
      await tx.update(sheet).set({ state: 'closed', closedAt: new Date(), closedBy: user.id }).where(eq(sheet.id, s.id))
      await logActivity(tx, { groupId: s.groupId, sheetId: s.id, actorUserId: user.id, kind: 'close', payload: { totalPaise: result.totalPaise } })
    })
    return c.json({ state: 'closed' as const })
  })

  .post('/sheets/:id/reopen', json(versionSchema), async (c) => {
    const { version } = c.req.valid('json')
    const s = await loadSheet(db, c.req.param('id'))
    const user = c.var.user
    await db.transaction(async (tx) => {
      await requireMember(tx, s.groupId, user.id, { admin: true })
      const { sheets } = await lockGroup(tx, s.groupId)
      const current = await bumpVersion(tx, s.id, version)
      if (current.state === 'open') throw badRequest('This month is already open.')
      const next = sheets.find((x) => x.startDate > s.startDate)
      if (next && next.state !== 'open') throw new AppError(422, 'later_closed', 'Reopen the later month first.')
      const gone = (await participantsOf(tx, s.id)).find((p) => p.status === 'former')
      if (gone) throw new AppError(422, 'former_member', `${gone.name} has left this group.`)
      // Payments are their own rows, so reopening never loses one.
      await tx
        .update(expense)
        .set({ deletedAt: new Date() })
        .where(and(eq(expense.sheetId, s.id), eq(expense.kind, 'sheet_close'), isNull(expense.deletedAt)))
      await tx.delete(sheetSnapshot).where(eq(sheetSnapshot.sheetId, s.id))
      await tx.update(sheet).set({ state: 'open', closedAt: null, closedBy: null }).where(eq(sheet.id, s.id))
      await logActivity(tx, { groupId: s.groupId, sheetId: s.id, actorUserId: user.id, kind: 'reopen' })
    })
    return c.json({ ok: true })
  })

  .post('/sheets/:id/statement', async (c) => {
    const s = await loadSheet(db, c.req.param('id'))
    await requireMember(db, s.groupId, c.var.user.id)
    let statement = await activeStatement(db, s.id)
    if (!statement) {
      const id = randomUUID()
      await db.insert(statementToken).values({ id, sheetId: s.id, tokenHash: hashToken(tokenFor('statement', id)), createdBy: c.var.user.id })
      statement = { id, link: statementLink(id) }
    }
    return c.json({ ...statement, share: await share(await sheetData(db, s), statement.link) })
  })

  .delete('/statements/:id', async (c) => {
    const [row] = await db.select().from(statementToken).where(eq(statementToken.id, c.req.param('id')))
    if (!row) throw notFound()
    const s = await loadSheet(db, row.sheetId)
    await requireMember(db, s.groupId, c.var.user.id)
    await db.update(statementToken).set({ revokedAt: new Date() }).where(eq(statementToken.id, row.id))
    return c.json({ ok: true })
  })
