import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { app } from '../src/server/app.ts'
import { clock, db } from '../src/server/core.ts'
import { outbox } from '../src/server/mail.ts'

const ORIGIN = 'http://localhost:3000'

/** Wipe every table. Refuses to touch any database except TEST_DATABASE_URL. */
export async function resetDb() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error('refusing to truncate: DATABASE_URL is not TEST_DATABASE_URL')
  }
  await db.execute(sql`truncate table "user", session, account, verification, "group", member, sheet, sheet_participant,
    fund, expense, expense_payer, expense_share, payment, sheet_snapshot, statement_token, activity restart identity cascade`)
}

export function setToday(date: string) {
  clock.today = () => date
}

export type Res = { status: number; body: any }

export interface Client {
  name: string
  req: (method: string, path: string, body?: unknown) => Promise<Res>
}

export async function anon(method: string, path: string, body?: unknown, cookie?: string): Promise<Res & { text: string }> {
  const res = await app.request(`${ORIGIN}${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {}
  return { status: res.status, body: parsed, text }
}

/** The link in the latest mail to `to` (from the test outbox). */
export function mailLink(to: string) {
  const mail = outbox.findLast((m) => m.to === to)
  if (!mail) throw new Error(`no mail to ${to}`)
  return mail.text.match(/https?:\/\/\S+/)![0]
}

/** `name=value` pairs from a response's Set-Cookie headers. */
export const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

export const clientFor = (name: string, cookie: string): Client => ({ name, req: (method, path, body) => anon(method, path, body, cookie) })

/** Sign up with email + password, open the verification link, and return a client carrying the session cookie. */
export async function signUp(name: string, email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`): Promise<Client> {
  const res = await anon('POST', '/api/auth/sign-up/email', { name, email, password: 'password-123' })
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${res.text}`)
  const verified = await app.request(mailLink(email))
  const cookie = cookieOf(verified)
  if (!cookie) throw new Error(`verification failed: ${verified.status} ${await verified.text()}`)
  return clientFor(name, cookie)
}

export const R = (rupees: number) => rupees * 100
export const uuid = randomUUID
