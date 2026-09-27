import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

// The server uses the real IST date, so tests back-fill last month (always closable) as the first month.
const now = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) + 'T00:00:00Z')
const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
const lastMonthName = last.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const lastMonthDate = last.toISOString().slice(0, 10)
const thisMonthName = now.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const todayDate = now.toISOString().slice(0, 10)

const shots = process.env.SHOTS
const shot = (page: Page, name: string) => (shots ? page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }) : null)

async function signUp(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a test account' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase()}-${randomUUID().slice(0, 8)}@e2e.local`)
  await page.getByLabel('Password').fill('password-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'PaiseGuru' })).toBeVisible()
}

async function createFamily(page: Page, firstMonth = lastMonthName) {
  await page.getByRole('link', { name: '+ New Hisaab' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Family')
  await page.getByLabel('For (optional)').fill('Dadi')
  await page.getByLabel('First month').selectOption({ label: firstMonth })
  for (const name of ['Suresh', 'Mahesh', 'Dinesh']) {
    await page.getByLabel('New member name').fill(name)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
  }
  await shot(page, '1-new-hisaab')
  await page.getByRole('button', { name: 'Create Hisaab' }).click()
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible()
}

async function addBill(page: Page, amount: string, paidBy: string, note: string, date = lastMonthDate) {
  await page.getByRole('link', { name: /Add/ }).first().click()
  await page.getByLabel('Amount (₹)').fill(amount)
  await page.getByLabel('Paid by').selectOption({ label: paidBy })
  await page.getByLabel('Date').fill(date)
  await page.getByLabel('Note (optional)').fill(note)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(note)).toBeVisible()
}

test.beforeEach(({ page }) => {
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('DELETE') : d.accept()))
})

test('create a Hisaab with members, back-filled months and an invite link', async ({ page }) => {
  await signUp(page, 'Ramesh')
  await shot(page, '0-home-empty')
  await createFamily(page)
  await expect(page.getByRole('link', { name: new RegExp(lastMonthName) })).toBeVisible()
  await expect(page.getByText('not joined')).toHaveCount(3)
  await page.getByRole('button', { name: 'Get invite link' }).click()
  await expect(page.getByText(/\/join\//)).toBeVisible()
  await shot(page, '2-hisaab')
})

test('join by invite link: claim a name, wait, get approved', async ({ page, browser }) => {
  await signUp(page, 'Ramesh')
  await createFamily(page)
  await page.getByRole('button', { name: 'Get invite link' }).click()
  const link = (await page.getByText(/\/join\//).textContent())!.trim()

  const other = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await signUp(other, 'Suresh')
  await other.goto(new URL(link).pathname)
  await shot(other, '3-join')
  await other.getByRole('button', { name: "I'm Suresh" }).click()
  await expect(other.getByText('Waiting for the admin to approve you.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('waiting for approval')).toBeVisible()
  await page.getByRole('button', { name: 'Options' }).first().click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('waiting for approval')).toHaveCount(0)

  await other.reload()
  await expect(other.getByText('Suresh(you)').or(other.getByText('Suresh (you)'))).toBeVisible()
  await expect(other.getByRole('link', { name: new RegExp(lastMonthName) })).toBeVisible()
})

test('add, edit and delete entries', async ({ page }) => {
  await signUp(page, 'Ramesh')
  await createFamily(page)
  await addBill(page, '1,200.50', 'Suresh', 'Medicines')
  await addBill(page, '300', 'Ramesh (you)', 'Fruit')
  await expect(page.getByText('₹1,500.50').first()).toBeVisible()
  await shot(page, '4-sheet-open')

  await page.getByText('Fruit').click()
  await page.getByLabel('Amount (₹)').fill('400')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('₹1,600.50').first()).toBeVisible()

  await page.getByText('Medicines').click()
  await page.getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('Medicines')).toHaveCount(0)
  await expect(page.getByText('₹400').first()).toBeVisible()
})

test('close a month with a Fixed exception, share, mark payments paid, then reopen', async ({ page }) => {
  await signUp(page, 'Ramesh')
  await createFamily(page)
  await addBill(page, '9500', 'Ramesh (you)', 'Hospital')
  await addBill(page, '7000', 'Suresh', 'Nurse')
  await addBill(page, '2500', 'Mahesh', 'Groceries')
  await addBill(page, '1000', 'Dinesh', 'Medicines')

  await page.getByRole('link', { name: 'Close month' }).click()
  await page.getByLabel('Who').selectOption({ label: 'Ramesh' })
  await page.getByRole('radio', { name: 'Fixed amount' }).click()
  await page.getByLabel('Amount (₹)').fill('8000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('pays a fixed ₹8,000')).toBeVisible()
  await expect(page.getByText('2 payments clear the month: Dinesh → Suresh ₹3,000 · Mahesh → Ramesh ₹1,500')).toBeVisible()
  await shot(page, '5-close')

  await page.getByRole('button', { name: 'Close month and share' }).click()
  await expect(page.getByText(`${lastMonthName} is closed.`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.*Dinesh%20pays%20Suresh/)
  await page.getByRole('link', { name: 'See payments' }).click()
  await expect(page.getByText('Payments pending')).toBeVisible()
  await shot(page, '6-sheet-closed')

  // Partial payment leaves the rest unpaid, then pay everything.
  const payments = page.locator('li', { hasText: 'Dinesh pays Suresh' })
  await payments.getByRole('button', { name: 'Mark paid' }).first().click()
  await page.getByLabel(/Amount paid/).fill('1000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(page.locator('li', { hasText: 'Dinesh pays Suresh' }).getByText('₹2,000')).toBeVisible()
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Mark paid' }).first().click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0) // saved and the form closed
    await expect(page.getByRole('button', { name: 'Mark paid' })).toHaveCount(1 - i)
  }
  await expect(page.getByText('Settled')).toBeVisible()

  // Reopen keeps the payments as Money given.
  await page.getByRole('button', { name: 'Reopen this month' }).click()
  await expect(page.getByText('Open', { exact: true })).toBeVisible()
  await expect(page.getByText('Payment after close')).toHaveCount(3)
})

test("Dadi's pension: money in, bills from her money, extra-on-top share, close before month-end", async ({ page }) => {
  await signUp(page, 'Ramesh')
  await createFamily(page, thisMonthName)
  await page.getByRole('link', { name: '+ Add a bill' }).click()
  await page.getByRole('radio', { name: 'Money in for Dadi' }).click()
  await page.getByLabel('Amount (₹)').fill('10000')
  await page.getByLabel('Date').fill(todayDate)
  await page.getByLabel('Note (optional)').fill('Pension')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Money in for Dadi · Pension')).toBeVisible()

  await addBill(page, '2000', "From Dadi's money", 'Doctor', todayDate)
  await addBill(page, '900', 'Ramesh (you)', 'Medicines', todayDate)
  await addBill(page, '300', 'Suresh', 'Fruit', todayDate)
  const card = page.locator('dl') // the Dadi's money card figures
  await expect(card.getByText('₹10,000')).toBeVisible()
  await expect(card.getByText('₹2,000')).toBeVisible()
  await expect(card.getByText('₹8,000')).toBeVisible()

  // ₹1,200 to divide; Ramesh pays ₹200 extra → ₹1,000 ÷ 4 = ₹250 each, Ramesh ₹450.
  await page.getByRole('link', { name: 'Close month' }).click()
  await page.getByLabel('Who').selectOption({ label: 'Ramesh' })
  await page.getByRole('radio', { name: 'Extra on top' }).click()
  await page.getByLabel('Amount (₹)').fill('200')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('extra on top of an equal share')).toBeVisible()
  const shares = page.locator('section', { hasText: "Each member's share" })
  await expect(shares.locator('li', { hasText: 'Ramesh' }).getByText('₹450')).toBeVisible()
  await expect(shares.locator('li', { hasText: 'Mahesh' }).getByText('₹250')).toBeVisible()
  await shot(page, '7-close-extra')
  await page.getByRole('button', { name: 'Close month and share' }).click()
  await expect(page.getByText(`${thisMonthName} is closed.`)).toBeVisible()
})
