import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { app } from '../src/server/app.ts'
import { clock, db } from '../src/server/core.ts'

const ORIGIN = 'http://localhost:3000'

/** Wipe every table. Refuses to touch any database except TEST_DATABASE_URL. */
export async function resetDb() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error('refusing to truncate: DATABASE_URL is not TEST_DATABASE_URL')
  }
  await db.execute(sql`truncate table "user", session, account, verification, hisaab, member, sheet, sheet_participant,
    entry, transfer, sheet_snapshot, statement_token, activity restart identity cascade`)
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

/** Sign up through better-auth's dev email login and return a client carrying the session cookie. */
export async function signUp(name: string): Promise<Client> {
  const res = await app.request(`${ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ name, email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`, password: 'password-123' }),
  })
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`)
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return { name, req: (method, path, body) => anon(method, path, body, cookie) }
}

export const R = (rupees: number) => rupees * 100
export const uuid = randomUUID
