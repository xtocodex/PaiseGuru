import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

// The server uses the real IST date, so tests back-fill last month (always closable, and older) as the first month.
const now = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) + 'T00:00:00Z')
const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
const monthLong = (d: Date) => d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const lastMonthName = monthLong(last)
const lastMonthShort = lastMonthName.split(' ')[0]!
const lastMonthDate = last.toISOString().slice(0, 10)
const thisMonthName = monthLong(now)
const thisMonthShort = thisMonthName.split(' ')[0]!
const todayDate = now.toISOString().slice(0, 10)

const shots = process.env.SHOTS
const shot = (page: Page, name: string) => (shots ? page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }) : null)

async function signUp(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a test account' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase()}-${randomUUID().slice(0, 8)}@e2e.local`)
  await page.getByLabel('Password', { exact: true }).fill('password-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

/** Creates "Family" (For Dadi) with Suresh, Mahesh, Dinesh; ends on the Hisaab page. Returns its id. */
async function createFamily(page: Page, first: 'last' | 'this' = 'last') {
  await page.getByRole('link', { name: 'Hisaabs', exact: true }).click()
  await page.getByRole('link', { name: 'Create Hisaab' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Family')
  await page.getByPlaceholder('For example: Dadi').fill('Dadi')
  for (const name of ['Suresh', 'Mahesh', 'Dinesh']) {
    await page.getByLabel('New member name').fill(name)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
  }
  await page.getByRole('radiogroup', { name: 'First month' }).getByRole('radio', { name: first === 'last' ? lastMonthShort : thisMonthShort }).click()
  await shot(page, '1-new-hisaab')
  await page.getByRole('button', { name: 'Create Hisaab' }).click()
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible()
  return page.url().split('/').pop()!
}

async function addEntry(page: Page, hisaabId: string, o: { amount: string; note: string; paidBy?: string; type?: string; category?: string; date?: string }) {
  await page.goto(`/hisaabs/${hisaabId}/add`)
  if (o.type) await page.getByRole('radio', { name: o.type }).click()
  await page.getByLabel('Amount in rupees').fill(o.amount)
  if (o.paidBy) await page.getByRole('radiogroup', { name: 'Paid by' }).getByRole('radio', { name: o.paidBy, exact: true }).click()
  if (o.category) await page.getByRole('radiogroup', { name: 'Category' }).getByRole('radio', { name: o.category }).click()
  await page.getByLabel('Date').fill(o.date ?? lastMonthDate)
  await page.getByLabel('Note').fill(o.note)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/sheets\//)
  await expect(page.getByText(o.note, { exact: true })).toBeVisible()
}

test.beforeEach(({ page }) => {
  page.on('dialog', (d) => d.accept())
})

test('create a Hisaab with members, back-filled months and an invite link', async ({ page }) => {
  await signUp(page, 'Ramesh')
  await shot(page, '0-home-empty')
  await createFamily(page)
  await expect(page.getByRole('radio', { name: lastMonthShort })).toBeVisible()
  await expect(page.getByText('Not joined yet')).toHaveCount(3)
  await page.getByRole('button', { name: 'Invite members' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Get invite link' }).click()
  await expect(page.getByRole('dialog').getByText(/\/join\//)).toBeVisible()
  await shot(page, '2-hisaab')
})

test('join by invite link: claim a name, wait, get approved', async ({ page, browser }) => {
  await signUp(page, 'Ramesh')
  const id = await createFamily(page)
  await page.getByRole('button', { name: 'Invite members' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Get invite link' }).click()
  const link = (await page.getByRole('dialog').getByText(/\/join\//).textContent())!.trim()

  const other = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await signUp(other, 'Suresh')
  await other.goto(new URL(link).pathname)
  await shot(other, '3-join')
  await other.getByRole('button', { name: "I'm Suresh" }).click()
  await expect(other.getByText('You asked to join')).toBeVisible()

  await page.goto(`/hisaabs/${id}`)
  await expect(page.getByText('Waiting for approval')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Waiting for approval')).toHaveCount(0)

  await other.reload()
  await expect(other.getByText('Suresh (you)')).toBeVisible()
  await expect(other.getByRole('radio', { name: lastMonthShort })).toBeVisible()
})

test('add, edit and delete entries', async ({ page }) => {
  await signUp(page, 'Ramesh')
  const id = await createFamily(page)
  await addEntry(page, id, { amount: '1,200.50', paidBy: 'Suresh', note: 'Medicines' })
  await addEntry(page, id, { amount: '300', paidBy: 'You', note: 'Fruit', category: 'Food' })
  await expect(page.getByText('₹1,500.50').first()).toBeVisible()
  await shot(page, '4-sheet-open')

  await page.getByText('Fruit', { exact: true }).click()
  await page.getByLabel('Amount in rupees').fill('400')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('₹1,600.50').first()).toBeVisible()

  await page.getByText('Medicines', { exact: true }).click()
  await page.getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('Medicines', { exact: true })).toHaveCount(0)
  await expect(page.getByText('₹400').first()).toBeVisible()
})

test('close a month with a Fixed exception, share, mark payments paid, then reopen', async ({ page }) => {
  await signUp(page, 'Ramesh')
  const id = await createFamily(page)
  await addEntry(page, id, { amount: '9500', paidBy: 'You', note: 'Hospital' })
  await addEntry(page, id, { amount: '7000', paidBy: 'Suresh', note: 'Nurse' })
  await addEntry(page, id, { amount: '2500', paidBy: 'Mahesh', note: 'Groceries' })
  await addEntry(page, id, { amount: '1000', paidBy: 'Dinesh', note: 'Tablets' })

  await page.getByRole('link', { name: 'Close month' }).click()
  await page.getByRole('radiogroup', { name: 'Who pays more' }).getByRole('radio', { name: 'Ramesh' }).click()
  await page.getByRole('radio', { name: 'Fixed amount' }).click()
  await page.getByPlaceholder('Amount in ₹').fill('8000')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('Fixed ₹8,000')).toBeVisible()
  await shot(page, '5-close')
  await page.getByRole('button', { name: 'See who pays whom' }).click()
  await expect(page.getByText('2 payments settle everyone')).toBeVisible()
  await expect(page.getByText('Dinesh pays Suresh')).toBeVisible()
  await expect(page.getByText('Mahesh pays you')).toBeVisible()

  await page.getByRole('button', { name: 'Close month and share' }).click()
  await expect(page.getByText(`${lastMonthName} is closed`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.*Dinesh%20pays%20Suresh/)
  await page.getByRole('link', { name: 'See payments' }).click()
  await expect(page.getByText('Payments pending')).toBeVisible()
  await shot(page, '6-sheet-closed')

  // Partial payment leaves the rest unpaid, then pay everything.
  const dialog = page.getByRole('dialog')
  await page.locator('section', { hasText: 'Dinesh pays Suresh' }).getByRole('button', { name: 'Mark paid' }).click()
  await dialog.getByLabel('Amount paid (₹)').fill('1000')
  await dialog.getByRole('button', { name: 'Mark paid' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('section', { hasText: 'Dinesh pays Suresh' }).getByText('₹2,000')).toBeVisible()
  for (let left = 2; left > 0; left--) {
    await page.getByRole('button', { name: 'Mark paid' }).first().click()
    await dialog.getByRole('button', { name: 'Mark paid' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark paid' })).toHaveCount(left - 1)
  }
  await expect(page.getByText('Settled')).toBeVisible()

  // Reopen keeps the payments as Money given.
  await page.getByRole('button', { name: 'Reopen this month' }).click()
  await expect(page.getByText('Open', { exact: true })).toBeVisible()
  await expect(page.getByText('Payment after close')).toHaveCount(3)
})

test("Dadi's pension: money in, bills from her money, extra-on-top share, close before month-end", async ({ page }) => {
  await signUp(page, 'Ramesh')
  const id = await createFamily(page, 'this')
  await addEntry(page, id, { type: 'Money in', amount: '10000', note: 'Pension', date: todayDate })
  await addEntry(page, id, { amount: '2000', paidBy: "Dadi's money", note: 'Doctor', date: todayDate })
  await addEntry(page, id, { amount: '900', paidBy: 'You', note: 'Tablets', date: todayDate })
  await addEntry(page, id, { amount: '300', paidBy: 'Suresh', note: 'Fruit', date: todayDate })
  const card = page.locator('section', { hasText: "Dadi's money" }).locator('dl')
  await expect(card.getByText('₹10,000')).toBeVisible()
  await expect(card.getByText('₹2,000')).toBeVisible()
  await expect(card.getByText('₹8,000')).toBeVisible()

  // ₹1,200 to divide; Ramesh pays ₹200 extra → ₹1,000 ÷ 4 = ₹250 each, Ramesh ₹450.
  await page.getByRole('link', { name: 'Close month' }).click()
  await page.getByRole('radiogroup', { name: 'Who pays more' }).getByRole('radio', { name: 'Ramesh' }).click()
  await page.getByRole('radio', { name: 'Extra on top' }).click()
  await page.getByPlaceholder('Amount in ₹').fill('200')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('+₹200 extra')).toBeVisible()
  await expect(page.getByText('₹450')).toBeVisible()
  await expect(page.getByText('₹250')).toHaveCount(3)
  await shot(page, '7-close-extra')
  await page.getByRole('button', { name: 'See who pays whom' }).click()
  await page.getByRole('button', { name: 'Close month and share' }).click()
  await expect(page.getByText(`${thisMonthName} is closed`)).toBeVisible()
})

test('Me: sign out', async ({ page }) => {
  await signUp(page, 'Ramesh')
  await page.getByRole('link', { name: 'Me', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})
