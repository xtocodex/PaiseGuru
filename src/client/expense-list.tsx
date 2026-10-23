// Expenses grouped by day. Each row says who paid and what it means for the viewer.
import { istDate, shortDate } from '../domain/group.ts'
import { formatRupees } from '../domain/money.ts'
import type { ExpenseView } from './api.ts'
import { expenseIcon } from './categories.tsx'
import { Card, IconTile, Money, Row, Rows, cx } from './ui.tsx'

type Item = ExpenseView & { late?: boolean }

const dayLabel = (d: string) => (d === istDate(new Date()) ? `Today, ${shortDate(d)}` : shortDate(d))

/** What one expense means for the viewer, in a few words. */
function detail(e: Item, names: Record<string, string>, fundNames: Record<string, string>, meId: string) {
  const name = (id: string) => (id === meId ? 'you' : (names[id] ?? ''))
  if (e.kind === 'fund_in') return `Money in · ${fundNames[e.fundId!] ?? 'fund'}`
  if (e.fundId) return `From ${fundNames[e.fundId] ?? 'fund'} · not divided`
  const payers = e.payers.map((p) => name(p.memberId)).join(' and ')
  const head = e.kind === 'refund' ? `Refund to ${payers}` : `${payers.charAt(0).toUpperCase()}${payers.slice(1)} paid`
  if (e.splitMode === 'sheet') return `${head} · divided at month end`
  const sign = e.kind === 'refund' ? -1 : 1
  const mine = sign * ((e.payers.find((p) => p.memberId === meId)?.paidPaise ?? 0) - (e.shares.find((s) => s.memberId === meId)?.owedPaise ?? 0))
  if (mine > 0) return `${head} · you get back ${formatRupees(mine)}`
  if (mine < 0) return `${head} · your share ${formatRupees(-mine)}`
  return e.shares.some((s) => s.memberId === meId) || e.payers.some((p) => p.memberId === meId) ? `${head} · you're even` : `${head} · not involving you`
}

export function ExpenseList(props: { expenses: Item[]; names: Record<string, string>; fundNames: Record<string, string>; meId: string; groupId: string; empty: string }) {
  const byDay = new Map<string, Item[]>()
  for (const e of props.expenses) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  if (!props.expenses.length) return <p className="py-6 text-center text-sm text-muted">{props.empty}</p>
  return (
    <>
      {[...byDay]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([day, list]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold text-muted">{dayLabel(day)}</h2>
            <Card flush>
              <Rows>
                {list.map((e) => {
                  const sub = detail(e, props.names, props.fundNames, props.meId)
                  return (
                    <Row
                      key={e.id}
                      to="/groups/$id/expenses/$expenseId"
                      params={{ id: props.groupId, expenseId: e.id }}
                      search={{ sheet: e.sheetId ?? undefined }}
                      left={<IconTile icon={expenseIcon(e)} tone={e.kind === 'fund_in' ? 'gets' : 'brand'} />}
                      title={e.note || (e.kind === 'fund_in' ? 'Money in' : e.kind === 'refund' ? 'Refund' : (e.category ?? 'Expense'))}
                      subtitle={e.late ? `Late: dated ${shortDate(e.date)} · ${sub}` : sub}
                      right={<Money paise={e.amountPaise} sign={e.kind === 'fund_in'} className={cx('text-[15px] font-semibold', e.kind !== 'expense' && 'text-gets')} />}
                    />
                  )
                })}
              </Rows>
            </Card>
          </section>
        ))}
    </>
  )
}
