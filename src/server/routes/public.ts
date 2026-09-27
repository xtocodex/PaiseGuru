// GET /s/:token — read-only statement page, no login (S10). Server-rendered; every value is escaped by hono/html.
// Shows names and amounts only, never UPI IDs or emails.
import { Hono } from 'hono'
import { html } from 'hono/html'
import { and, eq, isNull } from 'drizzle-orm'
import { shortDate } from '../../domain/hisaab.ts'
import { formatRupees } from '../../domain/money.ts'
import { sheet, statementToken } from '../db.ts'
import { db, hashToken } from '../core.ts'
import { sheetData } from './sheet.ts'

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

const STATE_TEXT = { open: 'Not closed yet', closed: 'Closed, payments pending', cleared: 'Settled', carried: 'Carried to next month' }
const TYPE_TEXT = { bill: 'Bill', refund: 'Refund', money_given: 'Money given', money_in: 'Money in' }

export const publicRoutes = new Hono().get('/s/:token', async (c) => {
  const [row] = await db
    .select({ sheetId: statementToken.sheetId })
    .from(statementToken)
    .where(and(eq(statementToken.tokenHash, hashToken(c.req.param('token'))), isNull(statementToken.revokedAt)))
  if (!row) return c.html(page('Link not valid', html`<h1>This link was replaced or turned off</h1><p>Ask the family for the new link.</p>`), 404)

  const [s] = await db.select().from(sheet).where(eq(sheet.id, row.sheetId))
  const data = await sheetData(db, s!)
  const forLabel = data.hisaab.forLabel
  const name = (id: string | null) => (id ? (data.names[id] ?? '') : forLabel ? `From ${forLabel}'s money` : 'Outside the split')
  const r = data.result

  return c.html(
    page(
      `${data.hisaab.name} – ${data.sheet.name}`,
      html`<h1>${data.hisaab.name} – ${data.sheet.name}</h1>
        <p class="muted">${STATE_TEXT[data.sheet.state]}${data.hisaab.forLabel ? html` · For ${data.hisaab.forLabel}` : ''}</p>
        ${r.ok
          ? html`<h2>Total ${formatRupees(r.totalPaise)}</h2>
              ${r.dividablePaise !== r.totalPaise ? html`<p class="muted">Divided between members: ${formatRupees(r.dividablePaise)}</p>` : ''}
              ${forLabel && (r.forInPaise || r.forUsedPaise)
                ? html`<p class="muted">${forLabel}'s money: received ${formatRupees(r.forInPaise)}, used ${formatRupees(r.forUsedPaise)}, left ${formatRupees(data.forBalancePaise)}</p>`
                : ''}
              <table>
                <tr><th>Name</th><th class="n">Paid</th><th class="n">Share</th><th class="n">Balance</th></tr>
                ${r.members.map(
                  (m) =>
                    html`<tr><td>${name(m.memberId)}</td><td class="n">${formatRupees(m.paidPaise)}</td><td class="n">${formatRupees(m.obligationPaise)}</td><td class="n">${formatRupees(m.netPaise)}</td></tr>`,
                )}
              </table>`
          : html`<p>${r.message}</p>`}
        ${data.transfers.length
          ? html`<h2>Payments</h2>
              <table>
                ${data.transfers.map(
                  (t) =>
                    html`<tr><td>${name(t.from)} pays ${name(t.to)}</td><td class="n">${formatRupees(t.amountPaise)}</td><td>${t.status === 'paid' ? 'Paid' : 'Not paid yet'}</td></tr>`,
                )}
              </table>`
          : ''}
        <h2>Entries</h2>
        <table>
          ${data.entries.map(
            (e) =>
              html`<tr>
                <td>${shortDate(e.date)}${e.late ? html`<div class="muted">Late</div>` : ''}</td>
                <td>${TYPE_TEXT[e.type]}${e.category ? html` · ${e.category}` : ''}${e.note ? html`<div class="muted">${e.note}</div>` : ''}</td>
                <td>${e.type === 'money_in' ? `For ${forLabel ?? 'the Hisaab'}` : e.type === 'refund' ? `To ${name(e.toMemberId)}` : e.type === 'money_given' ? `${name(e.paidByMemberId)} → ${name(e.toMemberId)}` : name(e.paidByMemberId)}</td>
                <td class="n">${formatRupees(e.amountPaise)}</td>
              </tr>`,
          )}
        </table>
        <p class="muted">Made with PaiseGuru</p>`,
    ),
  )
})
