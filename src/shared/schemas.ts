// Request schemas: the single source for server validation and client forms.
import { z } from 'zod'
import { CATEGORIES } from '../domain/group.ts'
import { MAX_ENTRY_PAISE, MAX_MEMBERS } from '../domain/money.ts'

export const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/

const name = (max: number) => z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`)
const amountPaise = z.number().int().positive('Must be more than ₹0').max(MAX_ENTRY_PAISE, 'Too large')
const isoDate = z.iso.date()
const version = z.number().int().nonnegative()
const weight = z.number().int().positive().max(10_000) // hundredths of a share, or basis points

export const categorySchema = z.enum(CATEGORIES)
export const settleModeSchema = z.enum(['as_you_go', 'monthly'])

export const createGroupSchema = z.object({
  name: name(80),
  settleMode: settleModeSchema,
  category: categorySchema.default('Shared'),
  startMonth: isoDate.refine((d) => d.endsWith('-01'), 'Must be the 1st of a month').optional(), // monthly only
  members: z.array(name(60)).max(MAX_MEMBERS - 1).default([]),
})

export const updateGroupSchema = z.object({
  name: name(80).optional(),
  settleMode: settleModeSchema.optional(),
  joinApproval: z.boolean().optional(),
})

export const addPlaceholderSchema = z.object({ name: name(60) })
export const memberIdSchema = z.object({ memberId: z.uuid() })
export const mergeSchema = z.object({ placeholderId: z.uuid() })
export const joinSchema = z.object({ placeholderId: z.uuid().optional() })
export const memberSettingsSchema = z.object({ defaultWeight: weight })
export const createFundSchema = z.object({ name: name(60), holderMemberId: z.uuid().nullable().default(null) })

export const updateMeSchema = z.object({
  name: name(60).optional(),
  upiId: z
    .string()
    .trim()
    .refine((v) => v === '' || UPI_ID.test(v), 'This does not look like a UPI ID (like name@bank)')
    .optional(),
})

const payerSchema = z.object({ memberId: z.uuid(), paidPaise: amountPaise })
const splitPersonSchema = z.object({
  memberId: z.uuid(),
  exception: z.enum(['none', 'fixed', 'extra']).optional(),
  exceptionPaise: z.number().int().nonnegative().max(MAX_ENTRY_PAISE).optional(),
  weight: weight.optional(),
})

/**
 * kind expense: payers + a split, or `fundId` (paid from a fund, never split). kind refund: payers are who
 * got the money back. kind fund_in: money received by `fundId`. splitMode 'sheet': divided at month close.
 */
const expenseFields = {
  kind: z.enum(['expense', 'refund', 'fund_in']),
  amountPaise,
  category: categorySchema.nullable(),
  date: isoDate,
  note: z.string().trim().max(500).default(''),
  fundId: z.uuid().nullable().default(null),
  payers: z.array(payerSchema).max(MAX_MEMBERS).default([]),
  splitMode: z.enum(['equal', 'exact', 'shares', 'percent', 'adjust', 'sheet', 'none']),
  split: z.array(splitPersonSchema).max(MAX_MEMBERS).default([]),
}

export const createExpenseSchema = z.object({ id: z.uuid(), ...expenseFields })
export const updateExpenseSchema = z.object({ ...expenseFields, version })
export const versionSchema = z.object({ version })

export const participantSchema = z.object({
  exception: z.enum(['none', 'fixed', 'extra', 'skip']),
  exceptionPaise: z.number().int().nonnegative().max(MAX_ENTRY_PAISE * 100),
  version,
})

export const createPaymentSchema = z.object({
  id: z.uuid(),
  fromMemberId: z.uuid(),
  toMemberId: z.uuid(),
  amountPaise,
  via: z.enum(['upi', 'cash', 'other']),
  utr: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).default(''),
})

export type CreateGroup = z.input<typeof createGroupSchema>
export type CreateExpense = z.input<typeof createExpenseSchema>
export type CreatePayment = z.input<typeof createPaymentSchema>
