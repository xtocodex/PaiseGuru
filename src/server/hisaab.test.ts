import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { R, anon, resetDb, setToday, signUp, uuid, type Client } from '../../tests/helpers.ts'
import { db } from './core.ts'
import { member } from './db.ts'

beforeEach(resetDb)

async function setup() {
  setToday('2026-10-03')
  const admin = await signUp('Ramesh')
  const hisaabId = (await admin.req('POST', '/api/hisaabs', { name: 'Family', startMonth: '2026-10-01', members: ['Suresh', 'Mahesh'] })).body.id as string
  const view = async (c: Client = admin) => (await c.req('GET', `/api/hisaabs/${hisaabId}`)).body
  const h = await view()
  const id = (name: string) => h.members.find((m: any) => m.name === name).id as string
  return { admin, hisaabId, view, id, oct: h.sheets[0].id as string }
}

const bill = (paidBy: string, amountPaise = R(100)) => ({
  id: uuid(),
  type: 'bill',
  amountPaise,
  category: 'Food',
  date: '2026-10-02',
  note: '',
  paidByMemberId: paidBy,
  toMemberId: null,
})

async function join(c: Client, link: string, placeholderId?: string) {
  const token = new URL(link).pathname.split('/').pop()
  return c.req('POST', `/api/join/${token}`, placeholderId ? { placeholderId } : {})
}

describe('authz (S17): a non-member gets 404 on every route family', () => {
  it('404 everywhere, no data leak', async () => {
    const { admin, hisaabId, id, oct } = await setup()
    const e = (await admin.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Ramesh')))).body.id
    let s = (await admin.req('GET', `/api/sheets/${oct}`)).body
    setToday('2026-10-31')
    await admin.req('POST', `/api/sheets/${oct}/close`, { version: s.sheet.version })
    s = (await admin.req('GET', `/api/sheets/${oct}`)).body
    const transferId = s.transfers[0].id
    const statementId = (await admin.req('POST', `/api/sheets/${oct}/statement`)).body.id

    const stranger = await signUp('Stranger')
    const calls: [string, string, unknown?][] = [
      ['GET', `/api/hisaabs/${hisaabId}`],
      ['POST', `/api/hisaabs/${hisaabId}/invite`],
      ['POST', `/api/hisaabs/${hisaabId}/members`, { name: 'X' }],
      ['DELETE', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}`],
      ['POST', `/api/hisaabs/${hisaabId}/admin`, { memberId: id('Suresh') }],
      ['POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Ramesh'))],
      ['PATCH', `/api/entries/${e}`, { ...bill(id('Ramesh')), version: 0 }],
      ['DELETE', `/api/entries/${e}`, { version: 0 }],
      ['GET', `/api/sheets/${oct}`],
      ['PUT', `/api/sheets/${oct}/participants/${id('Ramesh')}`, { exception: 'skip', exceptionPaise: 0, version: 0 }],
      ['POST', `/api/sheets/${oct}/close`, { version: 0 }],
      ['POST', `/api/sheets/${oct}/reopen`, { version: 0 }],
      ['POST', `/api/transfers/${transferId}/paid`, { amountPaise: 1, via: 'manual', version: 0 }],
      ['POST', `/api/sheets/${oct}/statement`],
      ['DELETE', `/api/statements/${statementId}`],
      ['GET', `/api/sheets/${uuid()}`],
    ]
    for (const [method, path, body] of calls) {
      const res = await stranger.req(method, path, body)
      expect(res.status, `${method} ${path}`).toBe(404)
    }
    expect((await stranger.req('GET', '/api/hisaabs')).body.hisaabs).toEqual([])
  })

  it('signed out → 401; unknown API path → 404 JSON', async () => {
    expect((await anon('GET', '/api/hisaabs')).status).toBe(401)
    const a = await signUp('A')
    expect((await a.req('GET', '/api/nope')).status).toBe(404)
  })
})

describe('joining (S3)', () => {
  it('claim a placeholder: pending sees the name only, admin approves, the placeholder keeps its place', async () => {
    const { admin, hisaabId, id, view, oct } = await setup()
    await admin.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Suresh')))
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    const token = new URL(link).pathname.split('/').pop()
    const preview = (await suresh.req('GET', `/api/join/${token}`)).body
    expect(preview.placeholders.map((p: any) => p.name)).toEqual(['Suresh', 'Mahesh'])

    expect((await join(suresh, link, id('Suresh'))).body.status).toBe('pending')
    expect(await view(suresh)).toEqual({ id: hisaabId, name: 'Family', pending: true })
    expect((await suresh.req('GET', `/api/sheets/${oct}`)).status).toBe(404)

    expect((await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)).status).toBe(200)
    const s = (await suresh.req('GET', `/api/sheets/${oct}`)).body
    expect(s.me.memberId).toBe(id('Suresh'))
    expect(s.result.members.find((m: any) => m.memberId === id('Suresh')).paidPaise).toBe(R(100))
  })

  it('joining as new mid-month starts with Skip; a replaced link stops working', async () => {
    const { admin, hisaabId, oct } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const neha = await signUp('Neha')
    await join(neha, link)
    const pending = (await admin.req('GET', `/api/hisaabs/${hisaabId}`)).body.members.find((m: any) => m.name === 'Neha')
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${pending.id}/approve`)
    const s = (await neha.req('GET', `/api/sheets/${oct}`)).body
    expect(s.participants.find((p: any) => p.name === 'Neha').exception).toBe('skip')

    const newLink = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    expect(newLink).not.toBe(link)
    const late = await signUp('Late')
    expect((await join(late, link)).body.error).toBe('invite_invalid')
    expect((await join(late, newLink)).status).toBe(200)
  })

  it('admin undoes a wrong claim; admin merges a new joiner into the right placeholder', async () => {
    const { admin, hisaabId, id, view } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const mahesh = await signUp('Mahesh')
    await join(mahesh, link, id('Suresh')) // wrong name
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/unclaim`)
    expect((await mahesh.req('GET', `/api/hisaabs/${hisaabId}`)).status).toBe(404)

    await join(mahesh, link) // joins as new instead
    const newRow = (await view()).members.find((m: any) => m.status === 'pending')
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${newRow.id}/approve`)
    const merged = await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${newRow.id}/merge`, { placeholderId: id('Mahesh') })
    expect(merged.status, JSON.stringify(merged.body)).toBe(200)
    const after = await view(mahesh)
    expect(after.me.memberId).toBe(id('Mahesh'))
    expect(after.members.map((m: any) => m.name)).toEqual(['Ramesh', 'Suresh', 'Mahesh'])
  })
})

describe('leaving, former members, admin (S3)', () => {
  it('a member with entries in an unsettled month cannot leave; a former member reads only their months', async () => {
    const { admin, hisaabId, id, oct } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)
    const e = (await suresh.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Suresh')))).body.id
    expect((await suresh.req('DELETE', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}`)).body.error).toBe('member_has_entries')

    let s = (await admin.req('GET', `/api/sheets/${oct}`)).body
    await admin.req('DELETE', `/api/entries/${e}`, { version: s.sheet.version })
    expect((await suresh.req('DELETE', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}`)).status).toBe(200)

    // Removed from the open month, so October no longer lists them and they can't read it.
    expect((await suresh.req('GET', `/api/sheets/${oct}`)).status).toBe(404)
    const h = (await suresh.req('GET', `/api/hisaabs/${hisaabId}`)).body
    expect(h.me.status).toBe('former')
    expect(h.sheets).toEqual([])
    expect((await suresh.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Ramesh')))).status).toBe(403)
    s = (await admin.req('GET', `/api/sheets/${oct}`)).body
    expect(s.participants.map((p: any) => p.name)).toEqual(['Ramesh', 'Mahesh'])
  })

  it('a former member keeps read-only access to a settled month they took part in', async () => {
    const { admin, hisaabId, id, oct } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)
    let s = (await admin.req('GET', `/api/sheets/${oct}`)).body
    setToday('2026-10-31')
    await admin.req('POST', `/api/sheets/${oct}/close`, { version: s.sheet.version }) // nothing to pay → Cleared
    setToday('2026-11-02')
    await admin.req('GET', `/api/hisaabs/${hisaabId}`) // opens November
    expect((await suresh.req('DELETE', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}`)).status).toBe(200)
    s = (await suresh.req('GET', `/api/sheets/${oct}`)).body
    expect(s.sheet.state).toBe('cleared')
    const h = (await suresh.req('GET', `/api/hisaabs/${hisaabId}`)).body
    expect(h.sheets.map((x: any) => x.id)).toEqual([oct])
    // Reopening a month with a former member is blocked.
    expect((await admin.req('POST', `/api/sheets/${oct}/reopen`, { version: s.sheet.version })).body.error).toBe('former_member')
  })

  it('admin must hand over before leaving; exactly one admin after handover; reopen is admin-only', async () => {
    const { admin, hisaabId, id, oct } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)
    expect((await admin.req('DELETE', `/api/hisaabs/${hisaabId}/members/${id('Ramesh')}`)).body.error).toBe('admin_must_hand_over')

    let s = (await suresh.req('GET', `/api/sheets/${oct}`)).body
    setToday('2026-10-31')
    await suresh.req('POST', `/api/sheets/${oct}/close`, { version: s.sheet.version })
    s = (await suresh.req('GET', `/api/sheets/${oct}`)).body
    expect((await suresh.req('POST', `/api/sheets/${oct}/reopen`, { version: s.sheet.version })).body.error).toBe('admin_only')

    expect((await admin.req('POST', `/api/hisaabs/${hisaabId}/admin`, { memberId: id('Suresh') })).status).toBe(200)
    const admins = await db
      .select()
      .from(member)
      .where(and(eq(member.hisaabId, hisaabId), eq(member.role, 'admin')))
    expect(admins.map((m) => m.displayName)).toEqual(['Suresh'])
    expect((await suresh.req('POST', `/api/sheets/${oct}/reopen`, { version: s.sheet.version })).status).toBe(200)
  })

  it('account deletion keeps amounts under "Deleted user" and passes admin on', async () => {
    const { admin, hisaabId, id, oct } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)
    await admin.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Ramesh'), R(300)))
    expect((await admin.req('DELETE', '/api/me')).status).toBe(200)
    const s = (await suresh.req('GET', `/api/sheets/${oct}`)).body
    expect(s.names[id('Ramesh')]).toBe('Deleted user')
    expect(s.result.members.find((m: any) => m.memberId === id('Ramesh')).paidPaise).toBe(R(300))
    expect((await suresh.req('GET', `/api/hisaabs/${hisaabId}`)).body.me.role).toBe('admin')
  })
})

describe('home (S7 ledger lines, S15 news)', () => {
  it('shows the estimate before close, counts the share after close, and news only once', async () => {
    const { admin, hisaabId, id, oct } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)
    await suresh.req('GET', '/api/home') // first visit sets last seen

    await admin.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Ramesh'), R(300)))
    let home = (await suresh.req('GET', '/api/home')).body
    expect(home.hisaabs[0].lines).toEqual([{ sheetId: oct, sheetName: 'October 2026', state: 'open', myPaise: R(100), estimate: true }])
    expect(home.spendPaise).toBe(0)
    expect(home.news.map((n: any) => n.kind)).toEqual(['entry_create'])
    expect((await suresh.req('GET', '/api/home')).body.news).toEqual([])

    setToday('2026-10-31')
    const s = (await admin.req('GET', `/api/sheets/${oct}`)).body
    await admin.req('POST', `/api/sheets/${oct}/close`, { version: s.sheet.version })
    home = (await suresh.req('GET', '/api/home')).body
    expect(home.spendPaise).toBe(R(100))
    expect(home.payments).toMatchObject([{ fromName: 'Suresh', toName: 'Ramesh', amountPaise: R(100), iPay: true }])
  })
})

describe('news under concurrent Home loads (S15)', () => {
  it('two tabs loading Home at once show each new item exactly once', async () => {
    const { admin, hisaabId, id } = await setup()
    const link = (await admin.req('POST', `/api/hisaabs/${hisaabId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/hisaabs/${hisaabId}/members/${id('Suresh')}/approve`)
    await suresh.req('GET', '/api/home')
    await admin.req('POST', `/api/hisaabs/${hisaabId}/entries`, bill(id('Ramesh')))
    const [a, b] = await Promise.all([suresh.req('GET', '/api/home'), suresh.req('GET', '/api/home')])
    expect(a.body.news.length + b.body.news.length).toBe(1)
  })
})
