// GET /s/:token — read-only month statement, no login. Server-rendered; every value is escaped by hono/html.
// Shows names and amounts only, never UPI IDs or emails.
import { Hono } from 'hono'
import { html } from 'hono/html'
import { and, eq, isNull } from 'drizzle-orm'
import { shortDate } from '../../domain/group.ts'
import { formatRupees } from '../../domain/money.ts'
import { sheet, statementToken } from '../db.ts'
import { db, hashToken } from '../core.ts'
import { sheetData } from './expense.ts'

const page = (title: string, body: unknown) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>${title}</title>
      <style>
        body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 40rem; padding: 1rem; color: #0f172a; background: #fff; }
        h1 { font-size: 1.4rem; margin: 0 } h2 { font-size: 1.05rem; margin: 1.5rem 0 .5rem }
        table { width: 100%; border-collapse: collapse } td, th { padding: .35rem .25rem; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top }
        .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap } .muted { color: #64748b; font-size: .875rem }
      </style>
    </head>
    <body>
      ${body}
    </body>
  </html>`

const STATE_TEXT = { open: 'Not closed yet', closed: 'Closed' }
const SPLIT_TEXT: Record<string, string> = { sheet: 'Divided at month end', equal: 'Split equally', exact: 'Split by amounts', shares: 'Split by shares', percent: 'Split by percent', adjust: 'Split with changes' }

const PRIVACY = html`<h1>PaiseGuru privacy</h1>
  <p class="muted">Last updated 23 October 2026</p>
  <h2>What we store</h2>
  <p>Your name, email address and, if you sign in with Google, your Google profile picture. Your UPI ID if you add one. The groups you are in, and the expenses, payments, funds and notes that you or other members of those groups add.</p>
  <h2>Who can see it</h2>
  <p>Members of a group see that group's members, expenses, payments and notes. Your UPI ID is shown only to members of your groups, on the Pay button. A month's share link, if a member makes one, shows names and amounts to anyone who has the link, never UPI IDs or emails; any member can turn it off.</p>
  <h2>What we do not do</h2>
  <p>We do not sell your data, show ads, or read your bank account or SMS. PaiseGuru never receives your UPI PIN or any payment details: payments happen in your UPI app, and a member marks them as sent by hand.</p>
  <h2>Google sign-in</h2>
  <p>If you choose Google sign-in, we receive only your name, email address and profile picture from Google, to create and sign in to your account.</p>
  <h2>Deleting your account</h2>
  <p>Open Me, then Delete my account. Your name, sign-in and UPI ID are deleted. Amounts you added to shared groups stay under "Deleted user", so other members' balances do not change.</p>
  <h2>Contact</h2>
  <p>PaiseGuru is a product of xtocodex. Questions or requests: <a href="mailto:xtocodex@gmail.com">xtocodex@gmail.com</a>.</p>`

export const publicRoutes = new Hono()
  .get('/privacy', (c) => c.html(page('PaiseGuru privacy', PRIVACY)))
  .get('/s/:token', async (c) => {
  const [row] = await db
    .select({ sheetId: statementToken.sheetId })
    .from(statementToken)
    .where(and(eq(statementToken.tokenHash, hashToken(c.req.param('token'))), isNull(statementToken.revokedAt)))
  if (!row) return c.html(page('Link not valid', html`<h1>This link was replaced or turned off</h1><p>Ask the group for the new link.</p>`), 404)

  const [s] = await db.select().from(sheet).where(eq(sheet.id, row.sheetId))
  const data = await sheetData(db, s!)
  const name = (id: string) => data.names[id] ?? ''
  const r = data.result
  const who = (e: (typeof data.entries)[number]) => {
    if (e.kind === 'fund_in') return `Into ${data.fundNames[e.fundId!] ?? 'fund'}`
    if (e.fundId) return `From ${data.fundNames[e.fundId] ?? 'fund'}`
    const payers = e.payers.map((p) => name(p.memberId)).join(', ')
    return e.kind === 'refund' ? `To ${payers}` : payers
  }

  return c.html(
    page(
      `${data.group.name} – ${data.sheet.name}`,
      html`<h1>${data.group.name} – ${data.sheet.name}</h1>
        <p class="muted">${STATE_TEXT[data.sheet.state]}</p>
        ${r.ok
          ? html`<h2>Total ${formatRupees(r.totalPaise)}</h2>
              ${r.dividablePaise !== r.totalPaise ? html`<p class="muted">Divided between members: ${formatRupees(r.dividablePaise)}</p>` : ''}
              ${Object.entries(r.funds).map(
                ([id, f]) => html`<p class="muted">${data.fundNames[id] ?? 'Fund'}: received ${formatRupees(f.inPaise)}, used ${formatRupees(f.usedPaise)}</p>`,
              )}
              <table>
                <tr><th>Name</th><th class="n">Paid</th><th class="n">Share</th></tr>
                ${r.members.map(
                  (m) => html`<tr><td>${name(m.memberId)}</td><td class="n">${formatRupees(m.paidPaise)}</td><td class="n">${formatRupees(m.obligationPaise)}</td></tr>`,
                )}
              </table>`
          : html`<p>${r.message}</p>`}
        <h2>Entries</h2>
        <table>
          ${data.entries.map(
            (e) =>
              html`<tr>
                <td>${shortDate(e.date)}${e.late ? html`<div class="muted">Late</div>` : ''}</td>
                <td>${e.kind === 'refund' ? 'Refund' : e.kind === 'fund_in' ? 'Money in' : (e.category ?? 'Bill')}${e.note ? html`<div class="muted">${e.note}</div>` : ''}${!e.fundId && SPLIT_TEXT[e.splitMode] && e.splitMode !== 'sheet' ? html`<div class="muted">${SPLIT_TEXT[e.splitMode]}</div>` : ''}</td>
                <td>${who(e)}</td>
                <td class="n">${formatRupees(e.amountPaise)}</td>
              </tr>`,
          )}
        </table>
        <p class="muted" style="margin-top:2rem;text-align:center">Made with PaiseGuru</p>`,
    ),
  )
})
