import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

// The server uses the real IST date. Monthly tests back-fill last month (always closable) as the first month.
const now = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) + 'T00:00:00Z')
const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
const lastMonthShort = last.toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' })
const lastMonthDate = last.toISOString().slice(0, 10)

const shots = process.env.SHOTS
const shot = (page: Page, name: string) => (shots ? page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }) : null)

// The server runs in another process, so the e2e can't read its mail outbox: confirm the email in the
// test database instead (the link itself is covered in src/server/group.test.ts).
async function confirmEmail(email: string) {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  await client.query('update "user" set email_verified = true where email = $1', [email])
  await client.end()
}

async function signUp(page: Page, name: string) {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@e2e.local`
  await page.goto('/')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('password-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('status')).toContainText('Open it to finish creating your account')
  await confirmEmail(email)
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('password-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

/** Creates a group and ends on its page. Returns its id. */
async function createGroup(page: Page, o: { name: string; members: string[]; monthly?: boolean }) {
  await page.getByRole('link', { name: 'Groups', exact: true }).click()
  await page.getByRole('link', { name: 'Create a group' }).click()
  await page.getByLabel('Name', { exact: true }).fill(o.name)
  if (o.monthly) await page.getByRole('radio', { name: /Once a month/ }).click()
  for (const name of o.members) {
    await page.getByLabel('New member name').fill(name)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
  }
  if (o.monthly) await page.getByRole('radiogroup', { name: 'First month' }).getByRole('radio', { name: lastMonthShort }).click()
  await shot(page, `new-group-${o.monthly ? 'monthly' : 'as-you-go'}`)
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByRole('heading', { name: o.name })).toBeVisible()
  return page.url().split('/').pop()!
}

async function addExpense(page: Page, groupId: string, o: { amount: string; note: string; date?: string; shares?: Record<string, string> }) {
  await page.goto(`/groups/${groupId}/add`)
  await page.getByLabel('Amount in rupees').fill(o.amount)
  await page.getByLabel('Note').fill(o.note)
  if (o.shares) {
    await page.getByRole('button', { name: 'equally' }).click()
    const sheet = page.getByRole('dialog', { name: 'Split' })
    await sheet.getByRole('radiogroup', { name: 'How' }).getByRole('radio', { name: 'Shares' }).click()
    for (const [name, value] of Object.entries(o.shares)) await sheet.getByLabel(`${name} shares`).fill(value)
    await shot(page, 'split-shares')
    await sheet.getByRole('button', { name: 'Done' }).click()
  }
  if (o.date) await page.getByLabel('Date').fill(o.date)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(o.note, { exact: true })).toBeVisible()
}

test.beforeEach(({ page }) => {
  page.on('dialog', (d) => d.accept())
})

// protects=the as-you-go flow end to end; fails_when=an expense does not reach balances or the plan; no_claim=real UPI apps
test('as you go: split equally, then by shares, settle a placeholder in cash', async ({ page }) => {
  await signUp(page, 'Ramesh')
  const id = await createGroup(page, { name: 'Goa trip', members: ['Asha', 'Ravi'] })
  await addExpense(page, id, { amount: '900', note: 'Dinner' })
  await expect(page.getByText('You are owed').first()).toBeVisible()
  await expect(page.getByText('₹600').first()).toBeVisible()

  await addExpense(page, id, { amount: '1000', note: 'Taxi', shares: { Ramesh: '2', Asha: '1', Ravi: '1' } })
  // Dinner: +600. Taxi: paid 1000, share 500 → +500. Ramesh is owed ₹1,100; Asha and Ravi owe ₹550 each.
  await expect(page.getByText('₹1,100').first()).toBeVisible()
  await shot(page, 'group-as-you-go')

  await page.getByRole('link', { name: /Settle up/ }).click()
  await expect(page.getByText('2 payments settle everyone.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'I got it' }).first().click()
  await page.getByRole('dialog').getByRole('radio', { name: 'Cash' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click()
  await expect(page.getByText('One payment settles everyone.', { exact: false })).toBeVisible()
  await expect(page.getByText('Asha paid you')).toBeVisible()
  await shot(page, 'settle')
})

// protects=monthly close with Fixed and the result in balances; fails_when=month bills count before close
// or the Fixed amount is ignored; no_claim=the statement page layout
test('monthly: bills pile up, close with a Fixed amount, settle up shows the payments', async ({ page }) => {
  await signUp(page, 'Ramesh')
  const id = await createGroup(page, { name: 'Home', members: ['Suresh', 'Mahesh', 'Dinesh'], monthly: true })
  await addExpense(page, id, { amount: '20000', note: 'Rent and food', date: lastMonthDate })
  await expect(page.getByText('divided at month end')).toBeVisible()

  await page.getByRole('link', { name: 'Close month' }).click()
  const box = page.locator('section', { hasText: 'Does someone pay more' })
  await box.getByRole('radio', { name: 'Ramesh' }).click()
  await box.getByRole('radio', { name: 'Fixed amount' }).click()
  await box.getByPlaceholder('Amount in ₹').fill('8000')
  await box.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('Fixed ₹8,000')).toBeVisible()
  await expect(page.getByText('₹4,000')).toHaveCount(3)
  await page.getByRole('button', { name: 'See who pays whom' }).click()
  await page.getByRole('button', { name: 'Close month and share' }).click()
  await expect(page.getByText(/is closed/)).toBeVisible()
  await page.getByRole('link', { name: 'Settle up' }).click()
  await expect(page.getByText('3 payments settle everyone.', { exact: false })).toBeVisible()
  await expect(page.getByText('Suresh pays you')).toBeVisible()
  await shot(page, 'monthly-settle')
})

// protects=fund money in and fund-paid bills; fails_when=fund money changes balances; no_claim=who holds the cash
test('fund: money in and a bill paid from it change only the fund', async ({ page }) => {
  await signUp(page, 'Ramesh')
  const id = await createGroup(page, { name: "Mom's care", members: ['Suresh'] })
  await page.getByRole('button', { name: 'Members and settings' }).click()
  await page.getByRole('button', { name: 'Add a fund' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill("Mom's pension")
  await page.getByRole('dialog').getByRole('button', { name: 'Add fund' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: "Mom's pension" })).toBeVisible()

  await page.goto(`/groups/${id}/add`)
  await page.getByRole('radio', { name: 'Money in' }).click()
  await page.getByLabel('Amount in rupees').fill('10000')
  await page.getByLabel('Note').fill('Pension')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Pension', { exact: true })).toBeVisible()

  await page.goto(`/groups/${id}/add`)
  await page.getByLabel('Amount in rupees').fill('2000')
  await page.getByLabel('Note').fill('Medicines')
  await page.getByRole('button', { name: 'You' }).click()
  await page.getByRole('dialog').getByRole('radio', { name: "From Mom's pension" }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Medicines', { exact: true })).toBeVisible()
  await expect(page.getByText('₹8,000')).toBeVisible()
  await expect(page.getByText('All settled').first()).toBeVisible()
  await shot(page, 'fund')
})

// protects=invite, claim a name, Sent then Got it across two accounts; fails_when=the receiver never sees the
// payment or confirming fails; no_claim=approval flow (covered by integration tests)
test('two people: join by link, mark as sent, the receiver confirms', async ({ page, browser }) => {
  await signUp(page, 'Ramesh')
  const id = await createGroup(page, { name: 'Flat 402', members: ['Suresh'] })
  await page.getByRole('button', { name: 'Members and settings' }).click()
  await page.getByRole('button', { name: 'Invite people' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Get invite link' }).click()
  const link = (await page.getByRole('dialog').getByText(/\/join\//).textContent())!.trim()
  await addExpense(page, id, { amount: '1200', note: 'Wifi' })

  const other = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const suresh = await other.newPage()
  suresh.on('dialog', (d) => d.accept())
  await signUp(suresh, 'Suresh')
  await suresh.goto(new URL(link).pathname)
  await suresh.getByRole('button', { name: "I'm Suresh" }).click()
  await expect(suresh.getByText('You owe').first()).toBeVisible()
  await suresh.getByRole('link', { name: /Settle up/ }).click()
  await suresh.getByRole('button', { name: 'Mark as sent' }).click()
  await suresh.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click()
  await expect(suresh.getByText('Everyone is settled')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Did you get these?')).toBeVisible()
  await shot(page, 'home-confirm')
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('Did you get these?')).toHaveCount(0)
  await other.close()
})
