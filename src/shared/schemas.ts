// Request schemas: the single source for server validation and client forms.
import { z } from 'zod'
import { CATEGORIES } from '../domain/hisaab.ts'
import { MAX_ENTRY_PAISE, MAX_MEMBERS } from '../domain/money.ts'

export const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/ // S8

const name = (max: number) => z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`)
const amountPaise = z.number().int().positive('Must be more than ₹0').max(MAX_ENTRY_PAISE, 'Too large')
const isoDate = z.iso.date()
const version = z.number().int().nonnegative()

export const categorySchema = z.enum(CATEGORIES)

export const createHisaabSchema = z.object({
  name: name(80),
  forLabel: z.string().trim().max(60).optional(),
  category: categorySchema.default('Shared'),
  startMonth: isoDate.refine((d) => d.endsWith('-01'), 'Must be the 1st of a month'),
  members: z.array(name(60)).max(MAX_MEMBERS - 1).default([]),
})

export const addPlaceholderSchema = z.object({ name: name(60) })
export const memberIdSchema = z.object({ memberId: z.uuid() })
export const mergeSchema = z.object({ placeholderId: z.uuid() })
export const joinSchema = z.object({ placeholderId: z.uuid().optional() })

export const updateMeSchema = z.object({
  name: name(60).optional(),
  upiId: z
    .string()
    .trim()
    .refine((v) => v === '' || UPI_ID.test(v), 'This does not look like a UPI ID (like name@bank)')
    .optional(),
})

const entryFields = {
  type: z.enum(['bill', 'refund', 'money_given', 'money_in']),
  amountPaise,
  category: categorySchema.nullable(),
  date: isoDate,
  note: z.string().trim().max(500).default(''),
  paidByMemberId: z.uuid().nullable(),
  toMemberId: z.uuid().nullable(),
}

export const createEntrySchema = z.object({ id: z.uuid(), ...entryFields })
export const updateEntrySchema = z.object({ ...entryFields, version })
export const versionSchema = z.object({ version })

export const participantSchema = z.object({
  exception: z.enum(['none', 'fixed', 'extra', 'skip']),
  exceptionPaise: z.number().int().nonnegative().max(MAX_ENTRY_PAISE * 100),
  version,
})

export const markPaidSchema = z.object({ amountPaise, via: z.enum(['upi_link', 'manual']), version })

export type CreateHisaab = z.input<typeof createHisaabSchema>
export type CreateEntry = z.input<typeof createEntrySchema>
