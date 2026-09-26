// Shared server pieces: errors, clock, authz, sheet locking and versions, opening sheets, tokens.
import { createHash, createHmac } from 'node:crypto'
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { addMonths, istDate, monthEnd, monthOf, monthsFrom, type ISODate } from '../domain/hisaab.ts'
import { activity, db, hisaab, member, sheet, sheetParticipant, type Db, type Tx } from './db.ts'
import type { SessionUser } from './auth.ts'
import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'

export type Env = { Variables: { user: SessionUser } }
type Q = Db | Tx

export class AppError extends Error {
  code: string
  status: 400 | 401 | 403 | 404 | 409 | 422 | 503
  constructor(status: AppError['status'], code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFound = () => new AppError(404, 'not_found', 'Not found')
export const versionConflict = () => new AppError(409, 'version_conflict', 'This month changed, review again')
export const badRequest = (message: string, code = 'invalid') => new AppError(400, code, message)

/** "Today" in IST. Tests replace `clock.today` to fix the date. */
export const clock = { today: (): ISODate => istDate(new Date()) }

/** JSON body validation; the first problem becomes a 400 with a plain message. */
export const json = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0]
      throw badRequest(issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input')
    }
  })

// ── authz (S17) ──

export type MemberRow = typeof member.$inferSelect

/**
 * The caller's membership of a Hisaab. Not a member (or deleted) → 404, so foreign ids leak nothing.
 * Pending members pass only with `pending: true` (they see the name only). Former members pass only
 * with `former: true` (read-only, and the caller must also scope reads to their sheets).
 */
export async function requireMember(
  q: Q,
  hisaabId: string,
  userId: string,
  opts: { admin?: boolean; pending?: boolean; former?: boolean } = {},
): Promise<MemberRow> {
  const [me] = await q
    .select()
    .from(member)
    .where(and(eq(member.hisaabId, hisaabId), eq(member.userId, userId)))
  if (!me || me.status === 'deleted') throw notFound()
  if (me.status === 'pending' && !opts.pending) throw notFound()
  if (me.status === 'former' && !opts.former) throw new AppError(403, 'read_only', 'You have left this Hisaab, so you can only look.')
  if (opts.admin && me.role !== 'admin') throw new AppError(403, 'admin_only', 'Only the Hisaab admin can do this.')
  return me
}

/** A former member may read only sheets they took part in. */
export async function assertCanReadSheet(q: Q, me: MemberRow, sheetId: string) {
  if (me.status !== 'former') return
  const [row] = await q
    .select({ id: sheetParticipant.memberId })
    .from(sheetParticipant)
    .where(and(eq(sheetParticipant.sheetId, sheetId), eq(sheetParticipant.memberId, me.id)))
  if (!row) throw notFound()
}

// ── sheets ──

export type SheetRow = typeof sheet.$inferSelect

/**
 * Every Hisaab write starts here: lock all of the Hisaab's sheet rows (ordered, so no deadlocks).
 * This serializes writes per Hisaab; the version check then catches clients acting on an old view.
 */
export function lockSheets(tx: Tx, hisaabId: string): Promise<SheetRow[]> {
  return tx.select().from(sheet).where(eq(sheet.hisaabId, hisaabId)).orderBy(asc(sheet.startDate)).for('update')
}

/** S7 concurrency: UPDATE … WHERE version = expected; no row → 409. Without `expected` it just bumps. */
export async function bumpVersion(tx: Tx, sheetId: string, expected?: number): Promise<SheetRow> {
  const where = expected === undefined ? eq(sheet.id, sheetId) : and(eq(sheet.id, sheetId), eq(sheet.version, expected))
  const [row] = await tx
    .update(sheet)
    .set({ version: sql`${sheet.version} + 1` })
    .where(where)
    .returning()
  if (!row) throw versionConflict()
  return row
}

export async function bumpOpenSheets(tx: Tx, sheets: readonly SheetRow[]) {
  for (const s of sheets) if (s.state === 'open') await bumpVersion(tx, s.id)
}

/**
 * Open every missing monthly sheet from the Hisaab's start month up to `untilMonth` (phase 1: cycle day 1).
 * Idempotent: INSERT … ON CONFLICT DO NOTHING on (hisaab, start date), so concurrent callers make one sheet.
 * New sheets take the active members as participants, with exceptions copied from the previous sheet.
 */
export async function ensureSheets(tx: Tx, h: { id: string; startMonth: string }, untilMonth: ISODate = monthOf(clock.today())) {
  const [latest] = await tx.select({ month: sheet.month }).from(sheet).where(eq(sheet.hisaabId, h.id)).orderBy(desc(sheet.month)).limit(1)
  if (latest && latest.month >= untilMonth) return
  const first = latest ? addMonths(latest.month, 1) : h.startMonth
  for (const month of monthsFrom(first, untilMonth)) {
    const [created] = await tx
      .insert(sheet)
      .values({ hisaabId: h.id, startDate: month, endDate: monthEnd(month), month })
      .onConflictDoNothing()
      .returning()
    if (!created) continue
    const members = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.hisaabId, h.id), eq(member.status, 'active')))
    if (!members.length) continue
    const [prev] = await tx
      .select({ id: sheet.id })
      .from(sheet)
      .where(and(eq(sheet.hisaabId, h.id), lt(sheet.startDate, month)))
      .orderBy(desc(sheet.startDate))
      .limit(1)
    const prevRows = prev ? await tx.select().from(sheetParticipant).where(eq(sheetParticipant.sheetId, prev.id)) : []
    const prevBy = new Map(prevRows.map((r) => [r.memberId, r]))
    await tx.insert(sheetParticipant).values(
      members.map((m) => {
        const p = prevBy.get(m.id)
        return { sheetId: created.id, memberId: m.id, exception: p?.exception, exceptionPaise: p?.exceptionPaise, weight: p?.weight }
      }),
    )
  }
}

/** Add a member to every Open sheet (S7: someone joining mid-month starts with Skip). */
export async function addToOpenSheets(tx: Tx, sheets: readonly SheetRow[], memberId: string, exception: 'none' | 'skip') {
  const open = sheets.filter((s) => s.state === 'open')
  if (!open.length) return
  await tx
    .insert(sheetParticipant)
    .values(open.map((s) => ({ sheetId: s.id, memberId, exception })))
    .onConflictDoNothing()
  await bumpOpenSheets(tx, open)
}

export async function removeFromOpenSheets(tx: Tx, sheets: readonly SheetRow[], memberId: string) {
  const open = sheets.filter((s) => s.state === 'open')
  if (!open.length) return
  await tx.delete(sheetParticipant).where(
    and(
      inArray(
        sheetParticipant.sheetId,
        open.map((s) => s.id),
      ),
      eq(sheetParticipant.memberId, memberId),
    ),
  )
  await bumpOpenSheets(tx, open)
}

export async function loadHisaab(q: Q, id: string) {
  const [h] = await q.select().from(hisaab).where(eq(hisaab.id, id))
  if (!h) throw notFound()
  return h
}

export function logActivity(
  tx: Tx,
  row: { hisaabId: string; sheetId?: string | null; actorUserId: string; kind: string; payload?: Record<string, unknown> },
) {
  return tx.insert(activity).values({ ...row, payload: row.payload ?? {} })
}

// ── tokens (S3, S10): 128-bit, only SHA-256 hashes stored ──
// The token is an HMAC of a random stored id, so the link can be shown again without storing the token.
// Rotating BETTER_AUTH_SECRET turns every invite and statement link off.

export function tokenFor(kind: 'invite' | 'statement', id: string): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')
  return createHmac('sha256', secret).update(`${kind}:${id}`).digest().subarray(0, 16).toString('base64url')
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const appUrl = () => (process.env.BETTER_AUTH_URL ?? 'http://localhost:5173').replace(/\/$/, '')

export { db }
