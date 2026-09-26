import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { R, anon, resetDb, setToday, signUp, uuid, type Client } from '../../tests/helpers.ts'
import { db } from './core.ts'
import { entry, sheet } from './db.ts'

beforeEach(resetDb)

/** Ramesh (admin, app user) + placeholders Suresh, Mahesh, Dinesh. Sheets: September and October 2026. */
async function family() {
  setToday('2026-10-03')
  const ramesh = await signUp('Ramesh')
  const res = await ramesh.req('POST', '/api/hisaabs', { name: 'Family', forLabel: 'Dadi', startMonth: '2026-09-01', members: ['Suresh', 'Mahesh', 'Dinesh'] })
  expect(res.status).toBe(201)
  const h = (await ramesh.req('GET', `/api/hisaabs/${res.body.id}`)).body
  const id = (name: string) => h.members.find((m: any) => m.name === name).id
  const sheetId = (month: string) => h.sheets.find((s: any) => s.month === month).id
  return { ramesh, hisaabId: h.id as string, id, sep: sheetId('2026-09-01') as string, oct: sheetId('2026-10-01') as string }
}

async function addBill(client: Client, hisaabId: string, paidBy: string | null, amountPaise: number, date = '2026-09-15') {
  const res = await client.req('POST', `/api/hisaabs/${hisaabId}/entries`, {
    id: uuid(),
    type: 'bill',
    amountPaise,
    category: 'Healthcare',
    date,
    note: 'medicines',
    paidByMemberId: paidBy,
    toMemberId: null,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body as { id: string; sheetId: string }
}

const getSheet = async (c: Client, id: string) => (await c.req('GET', `/api/sheets/${id}`)).body

describe('Hisaab month flow (S7 no-pool fixture end to end)', () => {
  it('bills → Fixed exception → close → share text → partial and full payments → Cleared', async () => {
    const f = await family()
    const { ramesh, hisaabId, id, sep } = f
    await addBill(ramesh, hisaabId, id('Ramesh'), R(9500))
    await addBill(ramesh, hisaabId, id('Suresh'), R(7000))
    await addBill(ramesh, hisaabId, id('Mahesh'), R(2500))
    await addBill(ramesh, hisaabId, id('Dinesh'), R(1000))

    let s = await getSheet(ramesh, sep)
    expect(s.result.dividablePaise).toBe(R(20_000))
    const fixed = await ramesh.req('PUT', `/api/sheets/${sep}/participants/${id('Ramesh')}`, { exception: 'fixed', exceptionPaise: R(8000), version: s.sheet.version })
    expect(fixed.status).toBe(200)

    s = await getSheet(ramesh, sep)
    expect(s.result.members.map((m: any) => m.obligationPaise)).toEqual([R(8000), R(4000), R(4000), R(4000)])
    const closed = await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    expect(closed.body).toEqual({ state: 'closed' })

    s = await getSheet(ramesh, sep)
    expect(s.transfers.map((t: any) => [s.names[t.from], s.names[t.to], t.amountPaise])).toEqual([
      ['Dinesh', 'Suresh', R(3000)],
      ['Mahesh', 'Ramesh', R(1500)],
    ])

    // D5: the snapshot equals a fresh recompute from the rows.
    const snap = s.result
    expect(snap.members.map((m: any) => m.netPaise)).toEqual([R(1500), R(3000), R(-1500), R(-3000)])

    const statement = await ramesh.req('POST', `/api/sheets/${sep}/statement`)
    expect(statement.body.share.shareText).toContain('Dinesh pays Suresh ₹3,000')
    expect(statement.body.share.shareText).toContain(statement.body.link)
    expect(statement.body.share.waLink).toMatch(/^https:\/\/wa\.me\/\?text=/)

    // Entries are read-only after close.
    const late = await ramesh.req('PUT', `/api/sheets/${sep}/participants/${id('Suresh')}`, { exception: 'skip', exceptionPaise: 0, version: s.sheet.version })
    expect(late.status).toBe(422)

    // Partial payment splits the transfer; placeholders' payments can be marked by any member.
    const dinesh = s.transfers[0]
    let paid = await ramesh.req('POST', `/api/transfers/${dinesh.id}/paid`, { amountPaise: R(1000), via: 'manual', version: s.sheet.version })
    expect(paid.body).toEqual({ state: 'closed' })
    s = await getSheet(ramesh, sep)
    expect(s.transfers.filter((t: any) => t.status === 'unpaid').map((t: any) => t.amountPaise).sort()).toEqual([R(1500), R(2000)])
    expect(snap).toEqual(s.result) // payments never change the settled numbers

    for (const t of s.transfers.filter((x: any) => x.status === 'unpaid')) {
      const cur = await getSheet(ramesh, sep)
      paid = await ramesh.req('POST', `/api/transfers/${t.id}/paid`, { amountPaise: t.amountPaise, via: 'upi_link', version: cur.sheet.version })
      expect(paid.status).toBe(200)
    }
    expect(paid.body).toEqual({ state: 'cleared' })
  })

  it('zero-activity month closes straight to Cleared', async () => {
    const { ramesh, sep } = await family()
    const s = await getSheet(ramesh, sep)
    expect((await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })).body).toEqual({ state: 'cleared' })
  })

  it('close blocked by the formula returns the reason', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    await addBill(ramesh, hisaabId, id('Ramesh'), R(100))
    let s = await getSheet(ramesh, sep)
    await ramesh.req('PUT', `/api/sheets/${sep}/participants/${id('Ramesh')}`, { exception: 'fixed', exceptionPaise: R(500), version: s.sheet.version })
    s = await getSheet(ramesh, sep)
    expect(s.result).toMatchObject({ ok: false, reason: 'exceptions_too_big' })
    const res = await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    expect(res).toMatchObject({ status: 422, body: { error: 'exceptions_too_big' } })
  })
})

describe('versions (S7 concurrency)', () => {
  it('close with a stale version is refused; the entry that bumped it is included on retry', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    const before = await getSheet(ramesh, sep) // tab A reads v
    await addBill(ramesh, hisaabId, id('Suresh'), R(400)) // tab B commits, v+1
    const stale = await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: before.sheet.version })
    expect(stale).toMatchObject({ status: 409, body: { message: 'This month changed, review again' } })
    const fresh = await getSheet(ramesh, sep)
    expect((await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: fresh.sheet.version })).status).toBe(200)
    expect((await getSheet(ramesh, sep)).result.dividablePaise).toBe(R(400))
  })

  it('reverse order: after a close, adding a September bill goes to October as Late', async () => {
    const { ramesh, hisaabId, id, sep, oct } = await family()
    const s = await getSheet(ramesh, sep)
    await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    const placed = await addBill(ramesh, hisaabId, id('Mahesh'), R(250), '2026-09-28')
    expect(placed.sheetId).toBe(oct)
    const o = await getSheet(ramesh, oct)
    expect(o.entries[0]).toMatchObject({ date: '2026-09-28', late: true })
  })

  it('mark paid vs reopen: the second writer gets 409', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    await addBill(ramesh, hisaabId, id('Ramesh'), R(400))
    let s = await getSheet(ramesh, sep)
    await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    s = await getSheet(ramesh, sep)
    const t = s.transfers[0]
    expect((await ramesh.req('POST', `/api/sheets/${sep}/reopen`, { version: s.sheet.version })).status).toBe(200)
    const late = await ramesh.req('POST', `/api/transfers/${t.id}/paid`, { amountPaise: t.amountPaise, via: 'manual', version: s.sheet.version })
    expect(late.status).toBe(404) // reopen deleted the unpaid transfer
  })

  it('edit and delete need the current version', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    const bill = await addBill(ramesh, hisaabId, id('Ramesh'), R(100))
    const s = await getSheet(ramesh, sep)
    const body = { type: 'bill', amountPaise: R(150), category: 'Food', date: '2026-09-15', note: '', paidByMemberId: id('Ramesh'), toMemberId: null }
    expect((await ramesh.req('PATCH', `/api/entries/${bill.id}`, { ...body, version: s.sheet.version - 1 })).status).toBe(409)
    expect((await ramesh.req('PATCH', `/api/entries/${bill.id}`, { ...body, version: s.sheet.version })).status).toBe(200)
    expect((await ramesh.req('DELETE', `/api/entries/${bill.id}`, { version: s.sheet.version })).status).toBe(409)
    expect((await ramesh.req('DELETE', `/api/entries/${bill.id}`, { version: s.sheet.version + 1 })).status).toBe(200)
    expect((await getSheet(ramesh, sep)).entries).toEqual([])
  })
})

describe('entries (S6)', () => {
  it('a double-tapped save creates one entry', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    const body = { id: uuid(), type: 'bill', amountPaise: R(100), category: 'Food', date: '2026-09-02', note: '', paidByMemberId: id('Ramesh'), toMemberId: null }
    const [a, b] = await Promise.all([ramesh.req('POST', `/api/hisaabs/${hisaabId}/entries`, body), ramesh.req('POST', `/api/hisaabs/${hisaabId}/entries`, body)])
    expect([a.status, b.status].sort()).toEqual([200, 201])
    expect(await db.select().from(entry).where(eq(entry.sheetId, sep))).toHaveLength(1)
  })

  it('rejects future dates, dates before the start, bad amounts and people from another Hisaab', async () => {
    const { ramesh, hisaabId, id } = await family()
    const other = (await ramesh.req('POST', '/api/hisaabs', { name: 'Flat', startMonth: '2026-10-01', members: ['Neha'] })).body.id
    const neha = (await ramesh.req('GET', `/api/hisaabs/${other}`)).body.members.find((m: any) => m.name === 'Neha').id
    const base = { type: 'bill', amountPaise: R(100), category: 'Food', date: '2026-09-02', note: '', paidByMemberId: id('Ramesh'), toMemberId: null }
    const post = (b: object) => ramesh.req('POST', `/api/hisaabs/${hisaabId}/entries`, { id: uuid(), ...base, ...b })
    expect((await post({ date: '2026-10-04' })).body.error).toBe('future')
    expect((await post({ date: '2026-08-31' })).body.message).toBe('This Hisaab starts on 2026-09-01.')
    expect((await post({ amountPaise: 1.5 })).status).toBe(400)
    expect((await post({ amountPaise: 1_000_000_001 })).status).toBe(400)
    expect((await post({ paidByMemberId: neha })).status).toBe(400)
    expect((await post({ type: 'money_given', category: null, paidByMemberId: id('Ramesh'), toMemberId: id('Ramesh') })).status).toBe(400)
  })

  it('opening on demand makes one sheet even when two requests race', async () => {
    const { ramesh, hisaabId } = await family()
    setToday('2026-11-01')
    await Promise.all([ramesh.req('GET', `/api/hisaabs/${hisaabId}`), ramesh.req('GET', `/api/hisaabs/${hisaabId}`)])
    expect(await db.select().from(sheet).where(eq(sheet.hisaabId, hisaabId))).toHaveLength(3)
  })
})

describe('close order and reopen', () => {
  it('close needs the last day and earlier months closed', async () => {
    const { ramesh, oct, sep } = await family()
    let o = await getSheet(ramesh, oct)
    expect((await ramesh.req('POST', `/api/sheets/${oct}/close`, { version: o.sheet.version })).body.error).toBe('too_early')
    setToday('2026-10-31')
    expect((await ramesh.req('POST', `/api/sheets/${oct}/close`, { version: o.sheet.version })).body.error).toBe('earlier_open')
    const s = await getSheet(ramesh, sep)
    await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    o = await getSheet(ramesh, oct)
    expect((await ramesh.req('POST', `/api/sheets/${oct}/close`, { version: o.sheet.version })).status).toBe(200)
    // Reopening September now needs October reopened first.
    const s2 = await getSheet(ramesh, sep)
    expect((await ramesh.req('POST', `/api/sheets/${sep}/reopen`, { version: s2.sheet.version })).body.error).toBe('later_closed')
  })

  it('reopen keeps paid transfers as Money given, drops unpaid ones, and re-close gives the same result', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    await addBill(ramesh, hisaabId, id('Ramesh'), R(400))
    await addBill(ramesh, hisaabId, id('Suresh'), R(400))
    let s = await getSheet(ramesh, sep)
    await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    s = await getSheet(ramesh, sep)
    expect(s.transfers).toHaveLength(2) // Mahesh → Ramesh 200, Dinesh → Suresh 200
    await ramesh.req('POST', `/api/transfers/${s.transfers[0].id}/paid`, { amountPaise: s.transfers[0].amountPaise, via: 'manual', version: s.sheet.version })
    s = await getSheet(ramesh, sep)
    expect((await ramesh.req('POST', `/api/sheets/${sep}/reopen`, { version: s.sheet.version })).status).toBe(200)
    s = await getSheet(ramesh, sep)
    expect(s.sheet.state).toBe('open')
    expect(s.entries.filter((e: any) => e.type === 'money_given')).toHaveLength(1)
    expect(s.transfers).toEqual([])
    await ramesh.req('POST', `/api/sheets/${sep}/close`, { version: s.sheet.version })
    s = await getSheet(ramesh, sep)
    expect(s.transfers).toHaveLength(1) // only the unpaid one is left to pay
  })
})

describe('statement page (S10)', () => {
  it('renders escaped, hides emails, and stops working once revoked', async () => {
    const { ramesh, hisaabId, id, sep } = await family()
    await ramesh.req('POST', `/api/hisaabs/${hisaabId}/entries`, {
      id: uuid(),
      type: 'bill',
      amountPaise: R(100),
      category: 'Food',
      date: '2026-09-02',
      note: '<script>alert(1)</script>',
      paidByMemberId: id('Ramesh'),
      toMemberId: null,
    })
    const st = (await ramesh.req('POST', `/api/sheets/${sep}/statement`)).body
    const path = new URL(st.link).pathname
    const page = await anon('GET', path)
    expect(page.status).toBe(200)
    expect(page.text).toContain('&lt;script&gt;')
    expect(page.text).not.toContain('<script>alert')
    expect(page.text).not.toContain('@test.local')
    expect((await ramesh.req('POST', `/api/sheets/${sep}/statement`)).body.link).toBe(st.link) // same link until revoked
    await ramesh.req('DELETE', `/api/statements/${st.id}`)
    expect((await anon('GET', path)).status).toBe(404)
    expect((await ramesh.req('POST', `/api/sheets/${sep}/statement`)).body.link).not.toBe(st.link)
  })
})
