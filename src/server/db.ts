// Drizzle schema (eng review Section 1 data model) and the database client.
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
  username: text('username').unique(), // better-auth username plugin: sign-in ID
  displayUsername: text('display_username'),
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

// ── Hisaab ──

export const hisaab = pgTable(
  'hisaab',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    forLabel: text('for_label'),
    category: text('category').notNull().default('Shared'),
    kind: text('kind', { enum: ['monthly', 'one_time'] }).notNull().default('monthly'),
    cycleDay: integer('cycle_day').notNull().default(1),
    startMonth: day('start_month').notNull(),
    joinApproval: boolean('join_approval').notNull().default(true),
    inviteNonce: uuid('invite_nonce'), // invite token = HMAC(secret, nonce); regenerating replaces the nonce
    inviteTokenHash: text('invite_token_hash').unique(),
    createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [check('hisaab_cycle_day', sql`${t.cycleDay} between 1 and 28`)],
)

export const member = pgTable(
  'member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hisaabId: uuid('hisaab_id')
      .notNull()
      .references(() => hisaab.id),
    // Allocation tie-break order (S2). Global identity: increasing per Hisaab, never changes, no insert race.
    seq: integer('seq').notNull().generatedAlwaysAsIdentity(),
    userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }), // null = placeholder
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
    status: text('status', { enum: ['pending', 'active', 'former', 'deleted'] }).notNull().default('active'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('member_hisaab_user').on(t.hisaabId, t.userId),
    unique('member_hisaab_id').on(t.hisaabId, t.id),
    uniqueIndex('member_one_admin').on(t.hisaabId).where(sql`${t.role} = 'admin'`),
    index('member_user_idx').on(t.userId),
  ],
)

export const sheet = pgTable(
  'sheet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hisaabId: uuid('hisaab_id')
      .notNull()
      .references(() => hisaab.id),
    startDate: day('start_date').notNull(),
    endDate: day('end_date'), // null only for one-time Hisaabs (phase 2)
    month: day('month').notNull(),
    state: text('state', { enum: ['open', 'closed', 'cleared', 'carried'] }).notNull().default('open'),
    version: integer('version').notNull().default(0),
    weightMode: text('weight_mode', { enum: ['shares', 'percent'] }).notNull().default('shares'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [unique('sheet_hisaab_start').on(t.hisaabId, t.startDate), unique('sheet_hisaab_id').on(t.hisaabId, t.id)],
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

export const entry = pgTable(
  'entry',
  {
    id: uuid('id').primaryKey(), // client-generated: a double-tapped save inserts once
    hisaabId: uuid('hisaab_id').notNull(),
    sheetId: uuid('sheet_id').notNull(),
    type: text('type', { enum: ['bill', 'refund', 'money_given', 'money_in'] }).notNull(),
    amountPaise: paise('amount_paise').notNull(),
    category: text('category'),
    date: day('date').notNull(),
    note: text('note').notNull().default(''),
    paidByMemberId: uuid('paid_by_member_id'), // bill: null = outside the split
    toMemberId: uuid('to_member_id'),
    source: text('source').notNull().default('manual'),
    createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.hisaabId, t.sheetId], foreignColumns: [sheet.hisaabId, sheet.id] }),
    foreignKey({ columns: [t.hisaabId, t.paidByMemberId], foreignColumns: [member.hisaabId, member.id] }),
    foreignKey({ columns: [t.hisaabId, t.toMemberId], foreignColumns: [member.hisaabId, member.id] }),
    index('entry_sheet_date_idx').on(t.sheetId, t.date).where(sql`${t.deletedAt} is null`),
    check('entry_amount', sql`${t.amountPaise} > 0 and ${t.amountPaise} <= 1000000000`),
  ],
)

export const transfer = pgTable(
  'transfer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hisaabId: uuid('hisaab_id').notNull(),
    sheetId: uuid('sheet_id').notNull(),
    fromMemberId: uuid('from_member_id').notNull(),
    toMemberId: uuid('to_member_id').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    status: text('status', { enum: ['unpaid', 'paid'] }).notNull().default('unpaid'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidBy: uuid('paid_by').references(() => user.id, { onDelete: 'set null' }),
    via: text('via', { enum: ['upi_link', 'manual'] }),
  },
  (t) => [
    foreignKey({ columns: [t.hisaabId, t.sheetId], foreignColumns: [sheet.hisaabId, sheet.id] }),
    foreignKey({ columns: [t.hisaabId, t.fromMemberId], foreignColumns: [member.hisaabId, member.id] }),
    foreignKey({ columns: [t.hisaabId, t.toMemberId], foreignColumns: [member.hisaabId, member.id] }),
    index('transfer_sheet_idx').on(t.sheetId),
    check('transfer_amount', sql`${t.amountPaise} > 0`),
  ],
)

/** D5: the computed close result (a CloseResult), written in the close transaction. */
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
    hisaabId: uuid('hisaab_id')
      .notNull()
      .references(() => hisaab.id),
    sheetId: uuid('sheet_id'),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activity_hisaab_created_idx').on(t.hisaabId, t.createdAt.desc())],
)

export const schema = {
  user, session, account, verification, hisaab, member, sheet, sheetParticipant, entry, transfer, sheetSnapshot, statementToken, activity,
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
export const db = drizzle(pool, { schema })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
