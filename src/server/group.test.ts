import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { R, anon, cookieOf, mailLink, resetDb, setToday, signUp, uuid, type Client } from '../../tests/helpers.ts'
import { app } from './app.ts'
import { db } from './core.ts'
import { member } from './db.ts'
import { outbox } from './mail.ts'

beforeEach(resetDb)

async function setup(settleMode: 'as_you_go' | 'monthly' = 'as_you_go') {
  setToday('2026-10-03')
  const admin = await signUp('Ramesh')
  const groupId = (await admin.req('POST', '/api/groups', { name: 'Flat 402', settleMode, members: ['Suresh', 'Mahesh'] })).body.id as string
  const view = async (c: Client = admin) => (await c.req('GET', `/api/groups/${groupId}`)).body
  const g = await view()
  const id = (name: string) => g.members.find((m: any) => m.name === name).id as string
  return { admin, groupId, view, id, g }
}

const equalBill = (payer: string, people: string[], amountPaise = R(300)) => ({
  id: uuid(),
  kind: 'expense',
  amountPaise,
  category: 'Food',
  date: '2026-10-02',
  payers: [{ memberId: payer, paidPaise: amountPaise }],
  splitMode: 'equal',
  split: people.map((memberId) => ({ memberId })),
})

async function join(c: Client, link: string, placeholderId?: string) {
  const token = new URL(link).pathname.split('/').pop()
  return c.req('POST', `/api/join/${token}`, placeholderId ? { placeholderId } : {})
}

// protects=foreign ids return 404 on every route family; fails_when=a route skips requireMember; no_claim=rate limits
describe('authz: a non-member gets 404 everywhere', () => {
  it('404 on every route, no data leak', async () => {
    const { admin, groupId, id } = await setup('monthly')
    const g = (await admin.req('GET', `/api/groups/${groupId}`)).body
    const oct = g.sheets[0].id
    const e = (await admin.req('POST', `/api/groups/${groupId}/expenses`, equalBill(id('Ramesh'), [id('Ramesh'), id('Suresh')]))).body.id
    const pay = uuid()
    await admin.req('POST', `/api/groups/${groupId}/payments`, { id: pay, fromMemberId: id('Suresh'), toMemberId: id('Ramesh'), amountPaise: R(10), via: 'cash' })
    const statementId = (await admin.req('POST', `/api/sheets/${oct}/statement`)).body.id

    const stranger = await signUp('Stranger')
    const calls: [string, string, unknown?][] = [
      ['GET', `/api/groups/${groupId}`],
      ['PATCH', `/api/groups/${groupId}`, { name: 'X' }],
      ['POST', `/api/groups/${groupId}/invite`],
      ['POST', `/api/groups/${groupId}/members`, { name: 'X' }],
      ['PATCH', `/api/groups/${groupId}/members/${id('Suresh')}`, { defaultWeight: 200 }],
      ['DELETE', `/api/groups/${groupId}/members/${id('Suresh')}`],
      ['POST', `/api/groups/${groupId}/admin`, { memberId: id('Suresh') }],
      ['POST', `/api/groups/${groupId}/funds`, { name: 'Kitty' }],
      ['GET', `/api/groups/${groupId}/expenses`],
      ['POST', `/api/groups/${groupId}/expenses`, equalBill(id('Ramesh'), [id('Ramesh')])],
      ['PATCH', `/api/expenses/${e}`, { ...equalBill(id('Ramesh'), [id('Ramesh')]), id: undefined, version: 0 }],
      ['DELETE', `/api/expenses/${e}`, { version: 0 }],
      ['GET', `/api/groups/${groupId}/payments`],
      ['POST', `/api/groups/${groupId}/payments`, { id: uuid(), fromMemberId: id('Suresh'), toMemberId: id('Ramesh'), amountPaise: 1, via: 'cash' }],
      ['POST', `/api/payments/${pay}/confirm`],
      ['DELETE', `/api/payments/${pay}`],
      ['GET', `/api/sheets/${oct}`],
      ['PUT', `/api/sheets/${oct}/participants/${id('Ramesh')}`, { exception: 'skip', exceptionPaise: 0, version: 0 }],
      ['POST', `/api/sheets/${oct}/close`, { version: 0 }],
      ['POST', `/api/sheets/${oct}/reopen`, { version: 0 }],
      ['POST', `/api/sheets/${oct}/statement`],
      ['DELETE', `/api/statements/${statementId}`],
      ['GET', `/api/sheets/${uuid()}`],
    ]
    for (const [method, path, body] of calls) {
      const res = await stranger.req(method, path, body)
      expect(res.status, `${method} ${path}`).toBe(404)
    }
    expect((await stranger.req('GET', '/api/groups')).body.groups).toEqual([])
  })

  it('signed out → 401; unknown API path → 404 JSON', async () => {
    expect((await anon('GET', '/api/groups')).status).toBe(401)
    const a = await signUp('A')
    expect((await a.req('GET', '/api/nope')).status).toBe(404)
  })
})

// protects=open sign-up with a verified email, password reset by mail; fails_when=an unverified account
// signs in, a wrong password signs in, a reset link is reusable or old sessions survive a reset;
// no_claim=Google sign-in and account linking (needs real OAuth), mail delivery (Resend)
describe('sign-up and sign-in', () => {
  it('anyone signs up with email; sign-in needs the confirmed email and the right password', async () => {
    const created = await anon('POST', '/api/auth/sign-up/email', { name: 'Asha', email: 'asha@test.local', password: 'secret-123' })
    expect(created.status).toBe(200)
    const unverified = await anon('POST', '/api/auth/sign-in/email', { email: 'asha@test.local', password: 'secret-123' })
    expect(unverified.status).toBe(403)
    expect(unverified.body.code).toBe('EMAIL_NOT_VERIFIED')
    expect(outbox.filter((m) => m.to === 'asha@test.local')).toHaveLength(2) // sign-up, then again on sign-in

    const verified = await app.request(mailLink('asha@test.local'))
    expect(cookieOf(verified)).toContain('session_token')
    expect((await anon('POST', '/api/auth/sign-in/email', { email: 'asha@test.local', password: 'wrong-pass' })).status).toBe(401)
    expect((await anon('POST', '/api/auth/sign-in/email', { email: 'asha@test.local', password: 'secret-123' })).status).toBe(200)
  })

  it('signing up with a taken email looks the same, and mails the owner instead', async () => {
    await signUp('Asha', 'asha@test.local')
    const again = await anon('POST', '/api/auth/sign-up/email', { name: 'Fake', email: 'asha@test.local', password: 'other-123' })
    expect(again.status).toBe(200)
    expect(outbox.findLast((m) => m.to === 'asha@test.local')!.subject).toBe('You already have a PaiseGuru account')
  })

  it('a reset link sets a new password once and signs out other devices', async () => {
    const asha = await signUp('Asha', 'asha@test.local')
    expect((await anon('POST', '/api/auth/request-password-reset', { email: 'asha@test.local', redirectTo: '/reset-password' })).status).toBe(200)
    // The link redirects to the app page with the token in the query.
    const opened = await app.request(mailLink('asha@test.local'))
    const token = new URL(opened.headers.get('location')!, 'http://x').searchParams.get('token')!
    expect(token).toBeTruthy()

    expect((await anon('POST', '/api/auth/reset-password', { token, newPassword: 'new-pass-123' })).status).toBe(200)
    expect((await anon('POST', '/api/auth/reset-password', { token, newPassword: 'again-123' })).status).toBe(400)
    expect((await asha.req('GET', '/api/me')).status).toBe(401)
    expect((await anon('POST', '/api/auth/sign-in/email', { email: 'asha@test.local', password: 'password-123' })).status).toBe(401)
    expect((await anon('POST', '/api/auth/sign-in/email', { email: 'asha@test.local', password: 'new-pass-123' })).status).toBe(200)
  })

  it('asking to reset an unknown email answers the same and sends nothing', async () => {
    const before = outbox.length
    expect((await anon('POST', '/api/auth/request-password-reset', { email: 'nobody@test.local', redirectTo: '/reset-password' })).status).toBe(200)
    expect(outbox.length).toBe(before)
  })
})

// protects=joining by link, claiming placeholders, approval; fails_when=a claim takes a taken name or skips approval;
// no_claim=invite link expiry (links never expire by design)
describe('joining', () => {
  it('claim a placeholder with approval on: pending sees the name only, admin approves, the placeholder keeps its place', async () => {
    const { admin, groupId, id, view } = await setup()
    await admin.req('PATCH', `/api/groups/${groupId}`, { joinApproval: true })
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    const token = new URL(link).pathname.split('/').pop()
    expect((await suresh.req('GET', `/api/join/${token}`)).body.placeholders.map((p: any) => p.name)).toEqual(['Suresh', 'Mahesh'])
    expect((await join(suresh, link, id('Suresh'))).body.status).toBe('pending')
    expect(await view(suresh)).toEqual({ id: groupId, name: 'Flat 402', pending: true })
    await admin.req('POST', `/api/groups/${groupId}/members/${id('Suresh')}/approve`)
    const after = await view(suresh)
    expect(after.me.memberId).toBe(id('Suresh'))
    expect(after.members.map((m: any) => m.name)).toEqual(['Ramesh', 'Suresh', 'Mahesh'])
  })

  it('joins straight in when approval is off (the default); a replaced link stops working', async () => {
    const { admin, groupId } = await setup()
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const asha = await signUp('Asha')
    expect((await join(asha, link)).body.status).toBe('active')
    await admin.req('POST', `/api/groups/${groupId}/invite`)
    expect((await join(await signUp('Late'), link)).status).toBe(404)
  })

  it('admin undoes a wrong claim; admin merges a new joiner into the right placeholder', async () => {
    const { admin, groupId, id, view } = await setup()
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Mahesh')) // wrong name
    await admin.req('POST', `/api/groups/${groupId}/members/${id('Mahesh')}/unclaim`)
    await join(suresh, link) // joins as new
    const mine = (await view(suresh)).me.memberId
    await admin.req('POST', `/api/groups/${groupId}/expenses`, equalBill(mine, [mine, id('Ramesh')]))
    expect((await admin.req('POST', `/api/groups/${groupId}/members/${mine}/merge`, { placeholderId: id('Suresh') })).status).toBe(200)
    const after = await view(suresh)
    expect(after.me.memberId).toBe(id('Suresh'))
    expect(after.members.find((m: any) => m.name === 'Suresh').netPaise).toBe(R(150))
  })
})

// protects=nobody leaves owing money, one admin always; fails_when=a member with a balance becomes former;
// no_claim=what the UI shows former members
describe('leaving and admin', () => {
  it('a member with a balance cannot leave; after settling they can', async () => {
    const { admin, groupId, id } = await setup()
    await admin.req('POST', `/api/groups/${groupId}/expenses`, equalBill(id('Ramesh'), [id('Ramesh'), id('Mahesh')]))
    expect((await admin.req('DELETE', `/api/groups/${groupId}/members/${id('Mahesh')}`)).body.error).toBe('member_has_balance')
    await admin.req('POST', `/api/groups/${groupId}/payments`, { id: uuid(), fromMemberId: id('Mahesh'), toMemberId: id('Ramesh'), amountPaise: R(150), via: 'cash' })
    expect((await admin.req('DELETE', `/api/groups/${groupId}/members/${id('Mahesh')}`)).status).toBe(200)
  })

  it('admin must hand over before leaving; only the admin removes others', async () => {
    const { admin, groupId, id, view } = await setup()
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    expect((await suresh.req('DELETE', `/api/groups/${groupId}/members/${id('Mahesh')}`)).status).toBe(403)
    expect((await admin.req('DELETE', `/api/groups/${groupId}/members/${id('Ramesh')}`)).body.error).toBe('admin_must_hand_over')
    await admin.req('POST', `/api/groups/${groupId}/admin`, { memberId: id('Suresh') })
    const roles = (await view(suresh)).members.map((m: any) => m.role)
    expect(roles.filter((r: string) => r === 'admin')).toHaveLength(1)
    expect((await admin.req('DELETE', `/api/groups/${groupId}/members/${id('Ramesh')}`)).status).toBe(200)
  })

  it('account deletion keeps amounts under "Deleted user" and passes admin on', async () => {
    const { admin, groupId, id, view } = await setup()
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await admin.req('POST', `/api/groups/${groupId}/expenses`, equalBill(id('Ramesh'), [id('Ramesh'), id('Suresh')]))
    await admin.req('DELETE', '/api/me')
    const after = await view(suresh)
    expect(after.members.find((m: any) => m.name === 'Deleted user').netPaise).toBe(R(150))
    expect(after.members.find((m: any) => m.name === 'Suresh').role).toBe('admin')
    const [row] = await db.select().from(member).where(and(eq(member.groupId, groupId), eq(member.id, id('Ramesh'))))
    expect(row!.status).toBe('deleted')
  })
})

// protects=Home totals and news; fails_when=a payment I owe or one waiting for my confirmation is missing;
// no_claim=Home layout
describe('home and lists', () => {
  it('Home shows what I owe, what to confirm, and news only once', async () => {
    const { admin, groupId, id } = await setup()
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await join(suresh, link, id('Suresh'))
    await suresh.req('GET', '/api/home') // first visit sets last seen
    await admin.req('POST', `/api/groups/${groupId}/expenses`, equalBill(id('Ramesh'), [id('Ramesh'), id('Suresh')]))
    let home = (await suresh.req('GET', '/api/home')).body
    expect(home.owePaise).toBe(R(150))
    expect(home.toPay).toEqual([expect.objectContaining({ to: id('Ramesh'), toName: 'Ramesh', amountPaise: R(150), toUpiId: null })])
    expect(home.news.map((n: any) => n.kind)).toEqual(['expense_create'])
    expect((await suresh.req('GET', '/api/home')).body.news).toEqual([])

    await suresh.req('POST', `/api/groups/${groupId}/payments`, { id: uuid(), fromMemberId: id('Suresh'), toMemberId: id('Ramesh'), amountPaise: R(150), via: 'upi' })
    home = (await admin.req('GET', '/api/home')).body
    expect(home.owedPaise).toBe(0)
    expect(home.toConfirm).toEqual([expect.objectContaining({ fromName: 'Suresh', amountPaise: R(150), via: 'upi' })])
  })

  it('group list shows my net and member count; Activity lists changes with who made them', async () => {
    const { admin, groupId, id } = await setup()
    await admin.req('POST', `/api/groups/${groupId}/expenses`, equalBill(id('Ramesh'), [id('Ramesh'), id('Suresh'), id('Mahesh')]))
    const list = (await admin.req('GET', '/api/groups')).body.groups
    expect(list).toEqual([expect.objectContaining({ name: 'Flat 402', settleMode: 'as_you_go', memberCount: 3, myNetPaise: R(200) })])
    const items = (await admin.req('GET', '/api/activity')).body.items
    expect(items.map((i: any) => [i.kind, i.actor, i.mine])).toEqual([
      ['expense_create', 'Ramesh', true],
      ['group_create', 'Ramesh', true],
    ])
  })
})

// protects=fund balance is in − used and never enters nets; fails_when=fund money changes a member's net;
// no_claim=who physically holds the money
describe('funds', () => {
  it('money in and bills paid from the fund move only the fund balance', async () => {
    const { admin, groupId, id, view } = await setup()
    const fundId = (await admin.req('POST', `/api/groups/${groupId}/funds`, { name: "Dadi's money", holderMemberId: id('Suresh') })).body.id
    const base = { date: '2026-10-02', payers: [], split: [], splitMode: 'none', fundId }
    expect((await admin.req('POST', `/api/groups/${groupId}/expenses`, { ...base, id: uuid(), kind: 'fund_in', amountPaise: R(10_000), category: null })).status).toBe(201)
    expect((await admin.req('POST', `/api/groups/${groupId}/expenses`, { ...base, id: uuid(), kind: 'expense', amountPaise: R(2000), category: 'Healthcare' })).status).toBe(201)
    const g = await view()
    expect(g.funds).toEqual([expect.objectContaining({ name: "Dadi's money", inPaise: R(10_000), usedPaise: R(2000), balancePaise: R(8000) })])
    expect(g.members.map((m: any) => m.netPaise)).toEqual([0, 0, 0])
    expect(g.plan).toEqual([])
    const bad = await admin.req('POST', `/api/groups/${groupId}/expenses`, { ...base, id: uuid(), kind: 'fund_in', amountPaise: R(1), category: null, payers: [{ memberId: id('Ramesh'), paidPaise: R(1) }] })
    expect(bad.body.message).toBe('Money in needs a fund, an amount and a date.')
  })
})

// protects=the public privacy page Google's consent screen links to; fails_when=it needs sign-in or 404s; no_claim=its wording
describe('privacy page', () => {
  it('loads without signing in', async () => {
    const res = await anon('GET', '/privacy')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Deleting your account')
  })
})
