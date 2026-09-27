// Sheet routes: entries (S6), exceptions, close, reopen, transfers (S7), statement links (S10).
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import {
  CLOSE_BLOCKED_TEXT,
  CLOSE_ORDER_TEXT,
  addMonths,
  checkCanClose,
  closeSheet,
  istDate,
  placeEntry,
  shareText,
  sheetName,
  type CloseResult,
  type Entry,
  type Participant,
} from '../../domain/hisaab.ts'
import { MAX_ENTRIES_PER_SHEET } from '../../domain/money.ts'
import { createEntrySchema, markPaidSchema, participantSchema, updateEntrySchema, versionSchema } from '../../shared/schemas.ts'
import { entry, hisaab, member, sheet, sheetParticipant, sheetSnapshot, statementToken, transfer, user, type Db, type Tx } from '../db.ts'
import {
  AppError,
  appUrl,
  assertCanReadSheet,
  badRequest,
  bumpVersion,
  clock,
  db,
  ensureSheets,
  hashToken,
  json,
  loadHisaab,
  lockSheets,
  logActivity,
  notFound,
  requireMember,
  tokenFor,
  type Env,
  type SheetRow,
} from '../core.ts'

type Q = Db | Tx
type EntryRow = typeof entry.$inferSelect

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

const liveEntries = (q: Q, sheetId: string) =>
  q
    .select()
    .from(entry)
    .where(and(eq(entry.sheetId, sheetId), isNull(entry.deletedAt)))
    .orderBy(asc(entry.date), asc(entry.createdAt))

const toDomain = (e: EntryRow): Entry => ({
  type: e.type,
  amountPaise: e.amountPaise,
  category: e.category,
  paidBy: e.paidByMemberId,
  to: e.toMemberId,
})

/** What a sheet shows: live preview while Open, the close snapshot afterwards (D5). */
export async function sheetData(q: Q, s: SheetRow) {
  const [h] = await q.select().from(hisaab).where(eq(hisaab.id, s.hisaabId))
  const [participants, entries, members] = await Promise.all([
    participantsOf(q, s.id),
    liveEntries(q, s.id),
    q.select({ id: member.id, name: member.displayName }).from(member).where(eq(member.hisaabId, s.hisaabId)),
  ])
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]))
  const recomputed = closeSheet(participants as Participant[], entries.map(toDomain))
  let result: CloseResult | { ok: false; reason: string; message: string }
  let transfers: (typeof transfer.$inferSelect)[] = []
  if (s.state === 'open') {
    result = recomputed.ok ? recomputed : { ...recomputed, message: CLOSE_BLOCKED_TEXT[recomputed.reason] }
  } else {
    const [snap] = await q.select().from(sheetSnapshot).where(eq(sheetSnapshot.sheetId, s.id))
    result = snap!.data as CloseResult
    if (!isDeepStrictEqual(recomputed, result)) {
      console.error(JSON.stringify({ level: 'error', msg: 'snapshot differs from recompute', sheetId: s.id }))
    }
    transfers = await q.select().from(transfer).where(eq(transfer.sheetId, s.id)).orderBy(desc(transfer.status), desc(transfer.amountPaise))
  }
  // The For person's money left after this sheet: money in − bills paid from it, over this and earlier sheets.
  const [balance] = await q
    .select({
      paise: sql<number>`coalesce(sum(case when ${entry.type} = 'money_in' then ${entry.amountPaise}
        when ${entry.type} = 'bill' and ${entry.paidByMemberId} is null then -${entry.amountPaise} else 0 end), 0)`.mapWith(Number),
    })
    .from(entry)
    .innerJoin(sheet, eq(sheet.id, entry.sheetId))
    .where(and(eq(entry.hisaabId, s.hisaabId), isNull(entry.deletedAt), sql`${sheet.startDate} <= ${s.startDate}`))
  return {
    hisaab: { id: h!.id, name: h!.name, forLabel: h!.forLabel },
    forBalancePaise: balance!.paise,
    sheet: { id: s.id, name: sheetName(s.month), month: s.month, startDate: s.startDate, endDate: s.endDate, state: s.state, version: s.version },
    names,
    participants: participants.map(({ memberId, name, exception, exceptionPaise, status, hasUser }) => ({ memberId, name, exception, exceptionPaise, status, hasUser })),
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amountPaise: e.amountPaise,
      category: e.category,
      date: e.date,
      note: e.note,
      paidByMemberId: e.paidByMemberId,
      toMemberId: e.toMemberId,
      late: e.date < s.startDate || (s.endDate !== null && e.date > s.endDate),
    })),
    result,
    transfers: transfers.map((t) => ({ id: t.id, from: t.fromMemberId, to: t.toMemberId, amountPaise: t.amountPaise, status: t.status, paidAt: t.paidAt })),
  }
}

/** The caller may read this sheet (active member, or a former member who took part). */
async function readableSheet(id: string, userId: string) {
  const s = await loadSheet(db, id)
  const me = await requireMember(db, s.hisaabId, userId, { former: true })
  await assertCanReadSheet(db, me, s.id)
  return { s, me }
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

function share(data: Awaited<ReturnType<typeof sheetData>>, link: string) {
  if (!data.result.ok || data.sheet.state === 'open') return null
  const text = shareText({ hisaabName: data.hisaab.name, sheetName: data.sheet.name, forLabel: data.hisaab.forLabel, result: data.result, names: data.names, link })
  return { shareText: text, waLink: `https://wa.me/?text=${encodeURIComponent(text)}` }
}

/** S6: who an entry names must fit its type and take part in the target sheet. */
async function checkEntryMembers(tx: Tx, sheetId: string, e: { type: Entry['type']; category: string | null; paidByMemberId: string | null; toMemberId: string | null }) {
  const { type, category, paidByMemberId: from, toMemberId: to } = e
  if (type === 'bill' && (to !== null || category === null)) throw badRequest('A bill needs a category and no receiver.')
  if (type === 'refund' && (to === null || from !== null || category === null)) throw badRequest('A refund needs a category and who received it.')
  if (type === 'money_given' && (from === null || to === null || from === to || category !== null)) {
    throw badRequest('Money given needs two different people.')
  }
  if (type === 'money_in' && (from !== null || to !== null || category !== null)) throw badRequest('Money in needs only an amount and a date.')
  const ids = new Set((await participantsOf(tx, sheetId)).map((p) => p.memberId))
  for (const id of [from, to]) if (id !== null && !ids.has(id)) throw badRequest('That person is not part of this month.')
}

async function targetSheet(tx: Tx, h: { id: string; startMonth: string }, sheets: SheetRow[], date: string) {
  const placed = placeEntry({ date, today: clock.today(), sheets })
  if (!placed.ok) {
    throw badRequest(placed.reason === 'future' ? "The date can't be in the future." : `This Hisaab starts on ${h.startMonth}.`, placed.reason)
  }
  if (placed.sheetId) return placed.sheetId
  // Every sheet is closed: open the next month on demand (S6).
  const next = addMonths(sheets.at(-1)!.month, 1)
  await ensureSheets(tx, h, next)
  const [created] = await tx
    .select({ id: sheet.id })
    .from(sheet)
    .where(and(eq(sheet.hisaabId, h.id), eq(sheet.month, next)))
  return created!.id
}

export const sheetRoutes = new Hono<Env>()
  .post('/hisaabs/:id/entries', json(createEntrySchema), async (c) => {
    const input = c.req.valid('json')
    const h = await loadHisaab(db, c.req.param('id'))
    const user = c.var.user
    const out = await db.transaction(async (tx) => {
      await requireMember(tx, h.id, user.id)
      await ensureSheets(tx, h)
      const sheets = await lockSheets(tx, h.id)
      const [dup] = await tx.select().from(entry).where(eq(entry.id, input.id))
      if (dup) {
        if (dup.hisaabId !== h.id) throw notFound()
        return { id: dup.id, sheetId: dup.sheetId, created: false } // double tap: same row
      }
      const sheetId = await targetSheet(tx, h, sheets, input.date)
      await checkEntryMembers(tx, sheetId, input)
      const [count] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(entry)
        .where(and(eq(entry.sheetId, sheetId), isNull(entry.deletedAt)))
      if (count!.n >= MAX_ENTRIES_PER_SHEET) throw badRequest('This month has too many entries.')
      await tx.insert(entry).values({ ...input, hisaabId: h.id, sheetId, createdBy: user.id })
      await bumpVersion(tx, sheetId)
      await logActivity(tx, { hisaabId: h.id, sheetId, actorUserId: user.id, kind: 'entry_create', payload: { type: input.type, amountPaise: input.amountPaise } })
      return { id: input.id, sheetId, created: true }
    })
    return c.json(out, out.created ? 201 : 200)
  })

  .patch('/entries/:id', json(updateEntrySchema), async (c) => {
    const { version, ...input } = c.req.valid('json')
    const user = c.var.user
    const [e] = await db.select().from(entry).where(and(eq(entry.id, c.req.param('id')), isNull(entry.deletedAt)))
    if (!e) throw notFound()
    const h = await loadHisaab(db, e.hisaabId)
    const out = await db.transaction(async (tx) => {
      await requireMember(tx, h.id, user.id)
      const sheets = await lockSheets(tx, h.id)
      const current = await bumpVersion(tx, e.sheetId, version)
      if (current.state !== 'open') throw closedMonth()
      const sheetId = input.date === e.date ? e.sheetId : await targetSheet(tx, h, sheets, input.date)
      if (sheetId !== e.sheetId) await bumpVersion(tx, sheetId)
      await checkEntryMembers(tx, sheetId, input)
      await tx
        .update(entry)
        .set({ ...input, sheetId })
        .where(eq(entry.id, e.id))
      await logActivity(tx, { hisaabId: h.id, sheetId, actorUserId: user.id, kind: 'entry_edit', payload: { type: input.type, amountPaise: input.amountPaise } })
      return { id: e.id, sheetId }
    })
    return c.json(out)
  })

  .delete('/entries/:id', json(versionSchema), async (c) => {
    const { version } = c.req.valid('json')
    const [e] = await db.select().from(entry).where(and(eq(entry.id, c.req.param('id')), isNull(entry.deletedAt)))
    if (!e) throw notFound()
    await db.transaction(async (tx) => {
      await requireMember(tx, e.hisaabId, c.var.user.id)
      await lockSheets(tx, e.hisaabId)
      const current = await bumpVersion(tx, e.sheetId, version)
      if (current.state !== 'open') throw closedMonth()
      await tx.update(entry).set({ deletedAt: new Date() }).where(eq(entry.id, e.id))
      await logActivity(tx, {
        hisaabId: e.hisaabId,
        sheetId: e.sheetId,
        actorUserId: c.var.user.id,
        kind: 'entry_delete',
        payload: { type: e.type, amountPaise: e.amountPaise },
      })
    })
    return c.json({ ok: true })
  })

  .get('/sheets/:id', async (c) => {
    const { s, me } = await readableSheet(c.req.param('id'), c.var.user.id)
    const data = await sheetData(db, s)
    const statement = me.status === 'active' ? await activeStatement(db, s.id) : null
    // Payees' UPI IDs for the Pay button (S8). Members only; never on the statement page.
    const payees = [...new Set(data.transfers.filter((t) => t.status === 'unpaid').map((t) => t.to))]
    const upi =
      me.status === 'active' && payees.length
        ? await db.select({ id: member.id, upiId: user.upiId }).from(member).innerJoin(user, eq(user.id, member.userId)).where(inArray(member.id, payees))
        : []
    return c.json({
      ...data,
      me: { memberId: me.id, role: me.role, status: me.status },
      statement,
      share: statement ? share(data, statement.link) : null,
      upiIds: Object.fromEntries(upi.filter((u) => u.upiId).map((u) => [u.id, u.upiId!])) as Record<string, string>,
    })
  })

  .put('/sheets/:id/participants/:mid', json(participantSchema), async (c) => {
    const { version, exception, exceptionPaise } = c.req.valid('json')
    const s = await loadSheet(db, c.req.param('id'))
    await db.transaction(async (tx) => {
      await requireMember(tx, s.hisaabId, c.var.user.id)
      await lockSheets(tx, s.hisaabId)
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
    const out = await db.transaction(async (tx) => {
      await requireMember(tx, s.hisaabId, user.id)
      const sheets = await lockSheets(tx, s.hisaabId)
      await bumpVersion(tx, s.id, version) // entries are read after this, under the lock
      const orderError = checkCanClose(s.id, sheets)
      if (orderError) throw new AppError(422, orderError, CLOSE_ORDER_TEXT[orderError])
      const participants = await participantsOf(tx, s.id)
      const result = closeSheet(participants as Participant[], (await liveEntries(tx, s.id)).map(toDomain))
      if (!result.ok) throw new AppError(422, result.reason, CLOSE_BLOCKED_TEXT[result.reason])

      if (result.transfers.length) {
        await tx.insert(transfer).values(
          result.transfers.map((t) => ({ hisaabId: s.hisaabId, sheetId: s.id, fromMemberId: t.from, toMemberId: t.to, amountPaise: t.amountPaise })),
        )
      }
      await tx.insert(sheetSnapshot).values({ sheetId: s.id, data: result })
      const state = result.transfers.length ? ('closed' as const) : ('cleared' as const)
      await tx.update(sheet).set({ state, closedAt: new Date(), closedBy: user.id }).where(eq(sheet.id, s.id))
      await logActivity(tx, { hisaabId: s.hisaabId, sheetId: s.id, actorUserId: user.id, kind: 'close', payload: { totalPaise: result.totalPaise } })
      console.log(JSON.stringify({ level: 'info', msg: 'sheet closed', sheetId: s.id, version: version + 1, dividablePaise: result.dividablePaise, transfers: result.transfers.length }))
      return { state }
    })
    return c.json(out)
  })

  .post('/sheets/:id/reopen', json(versionSchema), async (c) => {
    const { version } = c.req.valid('json')
    const s = await loadSheet(db, c.req.param('id'))
    const user = c.var.user
    await db.transaction(async (tx) => {
      await requireMember(tx, s.hisaabId, user.id, { admin: true })
      const sheets = await lockSheets(tx, s.hisaabId)
      const current = await bumpVersion(tx, s.id, version)
      if (current.state === 'open') throw badRequest('This month is already open.')
      const next = sheets.find((x) => x.startDate > s.startDate)
      if (next && next.state !== 'open') throw new AppError(422, 'later_closed', 'Reopen the later month first.')
      const gone = (await participantsOf(tx, s.id)).find((p) => p.status === 'former')
      if (gone) throw new AppError(422, 'former_member', `${gone.name} has left this Hisaab.`)

      // No recorded payment is ever lost: paid transfers become Money given entries in this sheet (S7).
      const paid = await tx
        .select()
        .from(transfer)
        .where(and(eq(transfer.sheetId, s.id), eq(transfer.status, 'paid')))
      if (paid.length) {
        await tx.insert(entry).values(
          paid.map((t) => ({
            id: randomUUID(),
            hisaabId: s.hisaabId,
            sheetId: s.id,
            type: 'money_given' as const,
            amountPaise: t.amountPaise,
            date: istDate(t.paidAt ?? new Date()),
            note: 'Payment after close',
            paidByMemberId: t.fromMemberId,
            toMemberId: t.toMemberId,
            createdBy: t.paidBy,
          })),
        )
      }
      await tx.delete(transfer).where(eq(transfer.sheetId, s.id))
      await tx.delete(sheetSnapshot).where(eq(sheetSnapshot.sheetId, s.id))
      await tx.update(sheet).set({ state: 'open', closedAt: null, closedBy: null }).where(eq(sheet.id, s.id))
      await logActivity(tx, { hisaabId: s.hisaabId, sheetId: s.id, actorUserId: user.id, kind: 'reopen', payload: { paidKept: paid.length } })
    })
    return c.json({ ok: true })
  })

  .post('/transfers/:id/paid', json(markPaidSchema), async (c) => {
    const { amountPaise, via, version } = c.req.valid('json')
    const [t] = await db.select().from(transfer).where(eq(transfer.id, c.req.param('id')))
    if (!t) throw notFound()
    const user = c.var.user
    const out = await db.transaction(async (tx) => {
      const me = await requireMember(tx, t.hisaabId, user.id)
      await lockSheets(tx, t.hisaabId)
      const current = await bumpVersion(tx, t.sheetId, version)
      if (current.state !== 'closed') throw new AppError(422, 'sheet_not_closed', 'This month has no payments waiting.')
      const [row] = await tx.select().from(transfer).where(eq(transfer.id, t.id))
      if (!row || row.status === 'paid') throw badRequest('This payment is already marked paid.')
      // Either party marks it paid. A party without the app (a placeholder) can't, so any member may act for them.
      const parties = await tx
        .select({ id: member.id, userId: member.userId })
        .from(member)
        .where(inArray(member.id, [row.fromMemberId, row.toMemberId]))
      const allowed = parties.some((p) => p.id === me.id || p.userId === null)
      if (!allowed) throw new AppError(403, 'not_a_party', 'Only the two people in this payment can mark it paid.')
      if (amountPaise > row.amountPaise) throw badRequest('That is more than this payment.')

      await tx.update(transfer).set({ amountPaise, status: 'paid', paidAt: new Date(), paidBy: user.id, via }).where(eq(transfer.id, row.id))
      if (amountPaise < row.amountPaise) {
        await tx.insert(transfer).values({
          hisaabId: row.hisaabId,
          sheetId: row.sheetId,
          fromMemberId: row.fromMemberId,
          toMemberId: row.toMemberId,
          amountPaise: row.amountPaise - amountPaise,
        })
      }
      const [left] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(transfer)
        .where(and(eq(transfer.sheetId, row.sheetId), ne(transfer.status, 'paid')))
      const state = left!.n === 0 ? ('cleared' as const) : ('closed' as const)
      if (state === 'cleared') await tx.update(sheet).set({ state }).where(eq(sheet.id, row.sheetId))
      await logActivity(tx, { hisaabId: row.hisaabId, sheetId: row.sheetId, actorUserId: user.id, kind: 'transfer_paid', payload: { amountPaise, via } })
      return { state }
    })
    return c.json(out)
  })

  .post('/sheets/:id/statement', async (c) => {
    const s = await loadSheet(db, c.req.param('id'))
    await requireMember(db, s.hisaabId, c.var.user.id)
    let statement = await activeStatement(db, s.id)
    if (!statement) {
      const id = randomUUID()
      await db.insert(statementToken).values({ id, sheetId: s.id, tokenHash: hashToken(tokenFor('statement', id)), createdBy: c.var.user.id })
      statement = { id, link: statementLink(id) }
    }
    return c.json({ ...statement, share: share(await sheetData(db, s), statement.link) })
  })

  .delete('/statements/:id', async (c) => {
    const [row] = await db.select().from(statementToken).where(eq(statementToken.id, c.req.param('id')))
    if (!row) throw notFound()
    const s = await loadSheet(db, row.sheetId)
    await requireMember(db, s.hisaabId, c.var.user.id)
    await db.update(statementToken).set({ revokedAt: new Date() }).where(eq(statementToken.id, row.id))
    return c.json({ ok: true })
  })
