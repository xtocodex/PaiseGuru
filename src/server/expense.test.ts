import { beforeEach, describe, expect, it } from 'vitest'
import { R, resetDb, setToday, signUp, uuid, type Client } from '../../tests/helpers.ts'

beforeEach(resetDb)

async function setup(settleMode: 'as_you_go' | 'monthly', names = ['Suresh', 'Mahesh', 'Dinesh']) {
  setToday('2026-10-03')
  const admin = await signUp('Ramesh')
  const groupId = (await admin.req('POST', '/api/groups', { name: 'Trip', settleMode, members: names })).body.id as string
  const view = async (c: Client = admin) => (await c.req('GET', `/api/groups/${groupId}`)).body
  const g = await view()
  const id = (name: string) => g.members.find((m: any) => m.name === name).id as string
  const add = (body: Record<string, unknown>) => admin.req('POST', `/api/groups/${groupId}/expenses`, { id: uuid(), kind: 'expense', category: 'Food', date: '2026-10-02', ...body })
  const nets = async () => Object.fromEntries((await view()).members.map((m: any) => [m.name, m.netPaise]))
  return { admin, groupId, view, id, add, nets, g }
}

const paid = (memberId: string, paidPaise: number) => ({ memberId, paidPaise })

// protects=per-expense splits become the right balances and plan; fails_when=owed amounts are wrong or Σ net ≠ 0;
// no_claim=the split editor UI
describe('as you go: expenses and balances', () => {
  it('₹1,000 by shares 2:1:1 → owed ₹500 / ₹250 / ₹250; the plan clears it', async () => {
    const { add, id, nets, view } = await setup('as_you_go')
    const res = await add({
      amountPaise: R(1000),
      payers: [paid(id('Ramesh'), R(1000))],
      splitMode: 'shares',
      split: [
        { memberId: id('Ramesh'), weight: 200 },
        { memberId: id('Suresh'), weight: 100 },
        { memberId: id('Mahesh'), weight: 100 },
      ],
    })
    expect(res.status).toBe(201)
    expect(await nets()).toEqual({ Ramesh: R(500), Suresh: R(-250), Mahesh: R(-250), Dinesh: 0 })
    expect((await view()).plan).toEqual([
      { from: id('Suresh'), to: id('Ramesh'), amountPaise: R(250) },
      { from: id('Mahesh'), to: id('Ramesh'), amountPaise: R(250) },
    ])
  })

  it('₹100 equal among 3: the payer has ₹33.34, the others ₹33.33', async () => {
    const { add, id, admin, groupId } = await setup('as_you_go')
    await add({ amountPaise: R(100), payers: [paid(id('Suresh'), R(100))], splitMode: 'equal', split: ['Ramesh', 'Suresh', 'Mahesh'].map((n) => ({ memberId: id(n) })) })
    const [e] = (await admin.req('GET', `/api/groups/${groupId}/expenses`)).body.expenses
    expect(Object.fromEntries(e.shares.map((s: any) => [s.memberId, s.owedPaise]))).toEqual({ [id('Ramesh')]: 3333, [id('Suresh')]: 3334, [id('Mahesh')]: 3333 })
  })

  it('two payers; a refund counts the other way', async () => {
    const { add, id, nets } = await setup('as_you_go', ['Suresh'])
    await add({ amountPaise: R(1000), payers: [paid(id('Ramesh'), R(600)), paid(id('Suresh'), R(400))], splitMode: 'equal', split: [{ memberId: id('Ramesh') }, { memberId: id('Suresh') }] })
    expect(await nets()).toEqual({ Ramesh: R(100), Suresh: R(-100) })
    await add({ kind: 'refund', amountPaise: R(200), payers: [paid(id('Ramesh'), R(200))], splitMode: 'equal', split: [{ memberId: id('Ramesh') }, { memberId: id('Suresh') }] })
    expect(await nets()).toEqual({ Ramesh: 0, Suresh: 0 })
  })

  it('refuses bad input with a plain message', async () => {
    const { add, id } = await setup('as_you_go')
    const base = { amountPaise: R(1000), payers: [paid(id('Ramesh'), R(1000))] }
    const msg = async (body: Record<string, unknown>) => (await add({ ...base, ...body })).body.message
    expect(await msg({ payers: [paid(id('Ramesh'), R(900))], splitMode: 'equal', split: [{ memberId: id('Ramesh') }] })).toBe('What each person paid must add up to the total.')
    expect(await msg({ splitMode: 'exact', split: [{ memberId: id('Ramesh'), exceptionPaise: R(700) }, { memberId: id('Suresh'), exceptionPaise: R(200) }] })).toBe('₹100 left to assign.')
    expect(await msg({ splitMode: 'equal', split: [{ memberId: uuid() }] })).toBe('Someone in this expense is not a member of the group.')
    expect(await msg({ splitMode: 'sheet', split: [] })).toBe('This group splits as you go. Pick how to split it.')
    expect(await msg({ splitMode: 'equal', split: [{ memberId: id('Ramesh') }], date: '2026-10-04' })).toBe("The date can't be in the future.")
  })

  it('edit and delete check the version; a double-tapped save inserts once', async () => {
    const { add, id, admin, groupId, nets } = await setup('as_you_go', ['Suresh'])
    const body = { id: uuid(), amountPaise: R(500), payers: [paid(id('Ramesh'), R(500))], splitMode: 'equal', split: [{ memberId: id('Ramesh') }, { memberId: id('Suresh') }] }
    expect((await add(body)).status).toBe(201)
    expect((await add(body)).status).toBe(200)
    const { id: eid, ...fields } = body
    const edit = { ...fields, kind: 'expense', category: 'Food', date: '2026-10-02', amountPaise: R(800), payers: [paid(id('Ramesh'), R(800))] }
    expect((await admin.req('PATCH', `/api/expenses/${eid}`, { ...edit, version: 0 })).status).toBe(200)
    expect((await admin.req('PATCH', `/api/expenses/${eid}`, { ...edit, version: 0 })).status).toBe(409)
    expect(await nets()).toEqual({ Ramesh: R(400), Suresh: R(-400) })
    expect((await admin.req('DELETE', `/api/expenses/${eid}`, { version: 1 })).status).toBe(200)
    expect(await nets()).toEqual({ Ramesh: 0, Suresh: 0 })
    expect((await admin.req('GET', `/api/groups/${groupId}/expenses`)).body.expenses).toEqual([])
  })
})

// protects=Sent counts at once, Not received reverses, only the receiver confirms; fails_when=a stranger
// confirms or a payment counts twice; no_claim=that money really moved (the app never sees UPI)
describe('payments: Sent, Got it, Not received', () => {
  it('sent changes balances, the receiver confirms, Not received puts the balance back', async () => {
    const { add, id, admin, groupId, nets } = await setup('as_you_go', ['Suresh'])
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const suresh = await signUp('Suresh')
    await suresh.req('POST', `/api/join/${new URL(link).pathname.split('/').pop()}`, { placeholderId: id('Suresh') })
    await add({ amountPaise: R(600), payers: [paid(id('Ramesh'), R(600))], splitMode: 'equal', split: [{ memberId: id('Ramesh') }, { memberId: id('Suresh') }] })

    const p1 = uuid()
    const sent = { id: p1, fromMemberId: id('Suresh'), toMemberId: id('Ramesh'), amountPaise: R(300), via: 'upi', utr: '123456789012' }
    expect((await suresh.req('POST', `/api/groups/${groupId}/payments`, sent)).status).toBe(201)
    expect((await suresh.req('POST', `/api/groups/${groupId}/payments`, sent)).status).toBe(200) // double tap
    expect(await nets()).toEqual({ Ramesh: 0, Suresh: 0 })
    expect((await suresh.req('POST', `/api/payments/${p1}/confirm`)).status).toBe(403) // only the receiver
    expect((await admin.req('POST', `/api/payments/${p1}/confirm`)).status).toBe(200)
    expect((await suresh.req('DELETE', `/api/payments/${p1}`)).body.error).toBe('confirmed')

    const p2 = uuid()
    await suresh.req('POST', `/api/groups/${groupId}/payments`, { ...sent, id: p2, utr: undefined })
    expect(await nets()).toEqual({ Ramesh: R(-300), Suresh: R(300) })
    expect((await admin.req('DELETE', `/api/payments/${p2}`)).status).toBe(200) // Not received
    expect(await nets()).toEqual({ Ramesh: 0, Suresh: 0 })
    const kinds = (await admin.req('GET', '/api/activity')).body.items.map((i: any) => i.kind)
    expect(kinds.slice(0, 4)).toEqual(['payment_rejected', 'payment_sent', 'payment_confirmed', 'payment_sent'])
  })

  it('a third member cannot record a payment between two app users; anyone can for a placeholder', async () => {
    const { id, admin, groupId } = await setup('as_you_go', ['Suresh', 'Mahesh'])
    const link = (await admin.req('POST', `/api/groups/${groupId}/invite`)).body.link
    const token = new URL(link).pathname.split('/').pop()
    const suresh = await signUp('Suresh')
    const mahesh = await signUp('Mahesh')
    await suresh.req('POST', `/api/join/${token}`, { placeholderId: id('Suresh') })
    await mahesh.req('POST', `/api/join/${token}`, { placeholderId: id('Mahesh') })
    const body = { id: uuid(), fromMemberId: id('Suresh'), toMemberId: id('Ramesh'), amountPaise: R(10), via: 'cash' }
    expect((await mahesh.req('POST', `/api/groups/${groupId}/payments`, body)).status).toBe(403)
    const solo = await setup('as_you_go', ['Asha', 'Ravi'])
    const forPlaceholder = { id: uuid(), fromMemberId: solo.id('Asha'), toMemberId: solo.id('Ravi'), amountPaise: R(10), via: 'cash' }
    expect((await solo.admin.req('POST', `/api/groups/${solo.groupId}/payments`, forPlaceholder)).status).toBe(201)
  })
})

// protects=the month close with Fixed, reopen keeping payments, frozen closed months; fails_when=month bills
// count before close or a reopen loses a payment; no_claim=the close screen UI
describe('monthly: close the month', () => {
  it('total ₹20,000 with Ramesh Fixed ₹8,000: the other three owe ₹4,000 each; reopen keeps payments', async () => {
    const { add, id, admin, groupId, view, nets } = await setup('monthly')
    const oct = (await view()).sheets[0]
    for (const [n, amount] of [['Ramesh', 9500], ['Suresh', 7000], ['Mahesh', 2500], ['Dinesh', 1000]] as const) {
      expect((await add({ amountPaise: R(amount), payers: [paid(id(n), R(amount))], splitMode: 'sheet' })).status).toBe(201)
    }
    expect(await nets()).toEqual({ Ramesh: 0, Suresh: 0, Mahesh: 0, Dinesh: 0 }) // not counted before close

    let s = (await admin.req('GET', `/api/sheets/${oct.id}`)).body
    await admin.req('PUT', `/api/sheets/${oct.id}/participants/${id('Ramesh')}`, { exception: 'fixed', exceptionPaise: R(8000), version: s.sheet.version })
    s = (await admin.req('GET', `/api/sheets/${oct.id}`)).body
    expect(s.result.members.map((m: any) => m.obligationPaise)).toEqual([R(8000), R(4000), R(4000), R(4000)])
    expect((await admin.req('POST', `/api/sheets/${oct.id}/close`, { version: s.sheet.version - 1 })).status).toBe(409)
    expect((await admin.req('POST', `/api/sheets/${oct.id}/close`, { version: s.sheet.version })).status).toBe(200)
    expect(await nets()).toEqual({ Ramesh: R(1500), Suresh: R(3000), Mahesh: R(-1500), Dinesh: R(-3000) })
    expect((await view()).plan).toEqual([
      { from: id('Mahesh'), to: id('Ramesh'), amountPaise: R(1500) },
      { from: id('Dinesh'), to: id('Suresh'), amountPaise: R(3000) },
    ])

    // A closed month is frozen: a bill dated in it lands in the next open month, marked late.
    setToday('2026-11-02')
    const late = await add({ amountPaise: R(100), payers: [paid(id('Ramesh'), R(100))], splitMode: 'sheet', date: '2026-10-20' })
    expect(late.body.sheetId).not.toBe(oct.id)

    await admin.req('POST', `/api/groups/${groupId}/payments`, { id: uuid(), fromMemberId: id('Dinesh'), toMemberId: id('Suresh'), amountPaise: R(3000), via: 'cash' })
    s = (await admin.req('GET', `/api/sheets/${oct.id}`)).body
    expect((await admin.req('POST', `/api/sheets/${oct.id}/reopen`, { version: s.sheet.version })).status).toBe(200)
    expect(await nets()).toEqual({ Ramesh: 0, Suresh: R(-3000), Mahesh: 0, Dinesh: R(3000) }) // the payment stays
  })

  it('a custom split in a monthly group counts at once; statement link works without login', async () => {
    const { add, id, admin, view, nets } = await setup('monthly', ['Suresh'])
    await add({ amountPaise: R(400), payers: [paid(id('Suresh'), R(400))], splitMode: 'equal', split: [{ memberId: id('Ramesh') }, { memberId: id('Suresh') }] })
    expect(await nets()).toEqual({ Ramesh: R(-200), Suresh: R(200) })
    const oct = (await view()).sheets[0]
    let s = (await admin.req('GET', `/api/sheets/${oct.id}`)).body
    await admin.req('POST', `/api/sheets/${oct.id}/close`, { version: s.sheet.version })
    const statement = (await admin.req('POST', `/api/sheets/${oct.id}/statement`)).body
    expect(statement.share.shareText).toContain('Ramesh pays Suresh ₹200')
    const page = await fetchStatement(statement.link)
    expect(page.status).toBe(200)
    expect(page.text).toContain('Split equally')
  })

  it('switching a monthly group to as-you-go needs the open month closed first', async () => {
    const { add, id, admin, groupId } = await setup('monthly', ['Suresh'])
    await add({ amountPaise: R(100), payers: [paid(id('Ramesh'), R(100))], splitMode: 'sheet' })
    expect((await admin.req('PATCH', `/api/groups/${groupId}`, { settleMode: 'as_you_go' })).body.error).toBe('month_open')
  })
})

async function fetchStatement(link: string) {
  const { anon } = await import('../../tests/helpers.ts')
  return anon('GET', new URL(link).pathname)
}
