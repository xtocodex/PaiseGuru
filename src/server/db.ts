// Drizzle schema (v2 money model, issue #2) and the database client.
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
// Money is bigint paise read as JS numbers: bounds (S1) keep every value far below 2^53.
const paise = (name: string) => bigint(name, { mode: 'number' })
const day = (name: string) => date(name, { mode: 'string' })

// ── better-auth tables (core schema, uuid ids) ──

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  upiId: text('upi_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ── Groups ──

export const group = pgTable('group', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  settleMode: text('settle_mode', { enum: ['as_you_go', 'monthly'] }).notNull(),
  category: text('category').notNull().default('Shared'),
  startMonth: day('start_month').notNull(), // monthly groups: the first month
  joinApproval: boolean('join_approval').notNull().default(false),
  inviteNonce: uuid('invite_nonce'), // invite token = HMAC(secret, nonce); regenerating replaces the nonce
  inviteTokenHash: text('invite_token_hash').unique(),
  createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

export const member = pgTable(
  'member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => group.id),
    // Allocation tie-break order. Global identity: increasing per group, never changes, no insert race.
    seq: integer('seq').notNull().generatedAlwaysAsIdentity(),
    userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }), // null = placeholder
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
    status: text('status', { enum: ['pending', 'active', 'former', 'deleted'] }).notNull().default('active'),
    defaultWeight: integer('default_weight').notNull().default(100), // shares prefill: 100 = 1 share
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('member_group_user').on(t.groupId, t.userId),
    unique('member_group_id').on(t.groupId, t.id),
    uniqueIndex('member_one_admin').on(t.groupId).where(sql`${t.role} = 'admin'`),
    index('member_user_idx').on(t.userId),
    check('member_default_weight', sql`${t.defaultWeight} between 1 and 10000`),
  ],
)

/** A month of a monthly group. As-you-go groups have none. */
export const sheet = pgTable(
  'sheet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => group.id),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    month: day('month').notNull(),
    state: text('state', { enum: ['open', 'closed'] }).notNull().default('open'),
    version: integer('version').notNull().default(0),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [unique('sheet_group_start').on(t.groupId, t.startDate), unique('sheet_group_id').on(t.groupId, t.id)],
)

export const sheetParticipant = pgTable(
  'sheet_participant',
  {
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => sheet.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => member.id),
    exception: text('exception', { enum: ['none', 'fixed', 'extra', 'skip'] }).notNull().default('none'),
    exceptionPaise: paise('exception_paise').notNull().default(0),
    weight: integer('weight').notNull().default(100),
  },
  (t) => [
    primaryKey({ columns: [t.sheetId, t.memberId] }),
    index('sheet_participant_member_idx').on(t.memberId),
    check('participant_amounts', sql`${t.exceptionPaise} >= 0 and ${t.weight} > 0`),
  ],
)

/** Money held for the group (e.g. a parent's pension, a trip kitty). Its balance never enters members' nets. */
export const fund = pgTable(
  'fund',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => group.id),
    name: text('name').notNull(),
    holderMemberId: uuid('holder_member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('fund_group_id').on(t.groupId, t.id),
    foreignKey({ columns: [t.groupId, t.holderMemberId], foreignColumns: [member.groupId, member.id] }),
  ],
)

/**
 * expense: a bill. refund: money back (payers = who received it; counts with the opposite sign).
 * fund_in: money received by a fund. sheet_close: a month's obligations (shares only, no payers).
 * split_mode 'sheet': divided at month close, so it counts only once its month is closed.
 * split_mode 'none': fund money (fund_in, fund-paid bills) and sheet_close.
 */
export const expense = pgTable(
  'expense',
  {
    id: uuid('id').primaryKey(), // client-generated: a double-tapped save inserts once
    groupId: uuid('group_id').notNull(),
    sheetId: uuid('sheet_id'),
    fundId: uuid('fund_id'),
    kind: text('kind', { enum: ['expense', 'refund', 'fund_in', 'sheet_close'] }).notNull(),
    amountPaise: paise('amount_paise').notNull(),
    splitMode: text('split_mode', { enum: ['equal', 'exact', 'shares', 'percent', 'adjust', 'sheet', 'none'] }).notNull(),
    category: text('category'),
    date: day('date').notNull(),
    note: text('note').notNull().default(''),
    version: integer('version').notNull().default(0),
    createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.groupId], foreignColumns: [group.id] }),
    foreignKey({ columns: [t.groupId, t.sheetId], foreignColumns: [sheet.groupId, sheet.id] }),
    foreignKey({ columns: [t.groupId, t.fundId], foreignColumns: [fund.groupId, fund.id] }),
    index('expense_group_date_idx').on(t.groupId, t.date).where(sql`${t.deletedAt} is null`),
    index('expense_sheet_idx').on(t.sheetId).where(sql`${t.deletedAt} is null`),
    check('expense_amount', sql`${t.amountPaise} > 0 and (${t.amountPaise} <= 1000000000 or ${t.kind} = 'sheet_close')`),
    check('expense_fund', sql`(${t.kind} = 'fund_in') <= (${t.fundId} is not null)`),
  ],
)

export const expensePayer = pgTable(
  'expense_payer',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expense.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => member.id),
    paidPaise: paise('paid_paise').notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] }), index('expense_payer_member_idx').on(t.memberId), check('payer_amount', sql`${t.paidPaise} > 0`)],
)

/** Who owes what. owed_paise is computed once at write, so a later rounding change never rewrites history. */
export const expenseShare = pgTable(
  'expense_share',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expense.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => member.id),
    exception: text('exception', { enum: ['none', 'fixed', 'extra'] }).notNull().default('none'),
    exceptionPaise: paise('exception_paise').notNull().default(0),
    weight: integer('weight').notNull().default(100),
    owedPaise: paise('owed_paise').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    index('expense_share_member_idx').on(t.memberId),
    check('share_amounts', sql`${t.owedPaise} >= 0 and ${t.exceptionPaise} >= 0 and ${t.weight} > 0`),
  ],
)

/** A payment between two members. Counts as soon as it is sent; the receiver may confirm it. */
export const payment = pgTable(
  'payment',
  {
    id: uuid('id').primaryKey(), // client-generated
    groupId: uuid('group_id').notNull(),
    fromMemberId: uuid('from_member_id').notNull(),
    toMemberId: uuid('to_member_id').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    status: text('status', { enum: ['sent', 'confirmed'] }).notNull().default('sent'),
    via: text('via', { enum: ['upi', 'cash', 'other'] }).notNull(),
    utr: text('utr'),
    note: text('note').notNull().default(''),
    createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    confirmedBy: uuid('confirmed_by').references(() => user.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.groupId, t.fromMemberId], foreignColumns: [member.groupId, member.id] }),
    foreignKey({ columns: [t.groupId, t.toMemberId], foreignColumns: [member.groupId, member.id] }),
    index('payment_group_idx').on(t.groupId).where(sql`${t.deletedAt} is null`),
    check('payment_amount', sql`${t.amountPaise} > 0 and ${t.fromMemberId} <> ${t.toMemberId}`),
  ],
)

/** The computed month close (a CloseResult), written in the close transaction. */
export const sheetSnapshot = pgTable('sheet_snapshot', {
  sheetId: uuid('sheet_id')
    .primaryKey()
    .references(() => sheet.id),
  data: jsonb('data').notNull(),
  createdAt: createdAt(),
})

export const statementToken = pgTable('statement_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  sheetId: uuid('sheet_id')
    .notNull()
    .references(() => sheet.id),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const activity = pgTable(
  'activity',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => group.id),
    sheetId: uuid('sheet_id'),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activity_group_created_idx').on(t.groupId, t.createdAt.desc())],
)

export const schema = {
  user, session, account, verification, group, member, sheet, sheetParticipant, fund, expense, expensePayer, expenseShare, payment, sheetSnapshot, statementToken, activity,
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
export const db = drizzle(pool, { schema })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
