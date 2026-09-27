import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, MessageCircle, Plus, RotateCcw, Share2 } from 'lucide-react'
import { istDate, shortDate } from '../../../../../domain/hisaab.ts'
import { formatRupees } from '../../../../../domain/money.ts'
import { api, call, type SheetView } from '../../../../api.ts'
import { entryIcon } from '../../../../categories.tsx'
import { PaymentSlip } from '../../../../payment-slip.tsx'
import { sheetQuery } from '../../../../queries.ts'
import { Avatar, Button, Card, ErrorBox, IconButton, IconTile, Loading, Money, Page, Row, Rows, SectionTitle, Segmented, Sheet, StateTag, Tag, cx } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/sheets/$id/')({ component: SheetPage })

function SheetPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(sheetQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Month" back="/hisaabs"><ErrorBox error={error} /></Page>
  return <Month s={data} />
}

const exceptionTag = (p: { exception: string; exceptionPaise: number }) =>
  p.exception === 'fixed' ? `Fixed ${formatRupees(p.exceptionPaise)}` : p.exception === 'extra' ? `+${formatRupees(p.exceptionPaise)} extra` : p.exception === 'skip' ? 'Skips' : null

function dayLabel(d: string) {
  return d === istDate(new Date()) ? `Today, ${shortDate(d)}` : shortDate(d)
}

function Month({ s }: { s: SheetView }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'bills' | 'shares'>('bills')
  const [shareOpen, setShareOpen] = useState(false)
  const open = s.sheet.state === 'open'
  const active = s.me.status === 'active'
  const r = s.result
  const forLabel = s.hisaab.forLabel
  const name = (id: string | null) => (id ? (s.names[id] ?? '') : forLabel ? `${forLabel}'s money` : 'Outside the split')
  const monthShort = s.sheet.name.split(' ')[0]
  const reopen = useMutation({
    mutationFn: () => call(api.sheets[':id'].reopen.$post({ param: { id: s.sheet.id }, json: { version: s.sheet.version } })),
    onSettled: () => queryClient.invalidateQueries(),
  })

  const byDay = new Map<string, SheetView['entries']>()
  for (const e of [...s.entries].reverse()) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const cats = r.ok ? Object.entries(r.categories).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : []
  const catTotal = cats.reduce((t, [, v]) => t + v, 0)
  const catColors = ['bg-brand', 'bg-marigold', 'bg-gets', 'bg-field']
  const unpaid = s.transfers.filter((t) => t.status === 'unpaid').length

  return (
    <Page
      title={monthShort}
      subtitle={`${s.hisaab.name} · ${s.entries.length} ${s.entries.length === 1 ? 'entry' : 'entries'}`}
      back={`/hisaabs/${s.hisaab.id}`}
      action={active && <IconButton icon={Share2} label="Share this month" soft onClick={() => setShareOpen(true)} />}
    >
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">{open ? 'Total so far' : 'Total'}</p>
            {r.ok ? <Money paise={r.totalPaise} className="text-[32px] font-bold tracking-tight" /> : <p className="mt-1 text-sm text-pays">{r.message}</p>}
          </div>
          <StateTag state={s.sheet.state} />
        </div>
        {r.ok && r.dividablePaise !== r.totalPaise && (
          <p className="mt-1 text-[13px] text-muted">
            <Money paise={r.dividablePaise} /> divided · <Money paise={r.totalPaise - r.dividablePaise} /> {forLabel ? `from ${forLabel}'s money` : 'outside the split'}
          </p>
        )}
        {open && active && (
          <div className="mt-3.5 flex gap-2">
            <Link to="/hisaabs/$id/add" params={{ id: s.hisaab.id }} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-marigold text-sm font-semibold text-on-marigold">
              <Plus className="size-4" aria-hidden />
              Add bill
            </Link>
            <Link to="/sheets/$id/close" params={{ id: s.sheet.id }} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-brand-text">
              <CheckCheck className="size-4" aria-hidden />
              Close month
            </Link>
          </div>
        )}
        {!open && active && s.share && (
          <a href={s.share.waLink} target="_blank" rel="noreferrer" className="press mt-3.5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gets text-sm font-semibold text-on-gets">
            <MessageCircle className="size-4" aria-hidden />
            Share result on WhatsApp
          </a>
        )}
      </Card>

      {s.transfers.length > 0 && (
        <>
          <SectionTitle action={<Tag tone={unpaid ? 'marigold' : 'gets'}>{unpaid ? `${unpaid} left` : 'All paid'}</Tag>}>Payments</SectionTitle>
          {s.transfers.map((t) => {
            const party = (id: string) => s.participants.find((p) => p.memberId === id)
            const canMark = active && (t.from === s.me.memberId || t.to === s.me.memberId || !party(t.from)?.hasUser || !party(t.to)?.hasUser)
            return (
              <PaymentSlip
                key={t.id}
                t={t}
                names={s.names}
                meMemberId={s.me.memberId}
                subtitle={t.status === 'paid' && t.paidAt ? `Paid ${shortDate(istDate(new Date(t.paidAt)))}` : s.upiIds[t.to]}
                upiId={s.upiIds[t.to]}
                hisaabName={s.hisaab.name}
                version={active ? s.sheet.version : undefined}
                canMark={canMark}
              />
            )
          })}
        </>
      )}

      <Segmented
        label="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bills', label: 'Bills' },
          { value: 'shares', label: 'Shares' },
        ]}
      />

      {tab === 'bills' && (
        <>
          {cats.length > 0 && (
            <Card>
              <p className="text-[13px] text-muted">By category</p>
              <div className="my-2.5 flex h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
                {cats.slice(0, 4).map(([c, v], i) => (
                  <i key={c} className={catColors[i]} style={{ width: `${(v / catTotal) * 100}%` }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                {cats.slice(0, 4).map(([c, v], i) => (
                  <li key={c} className="flex items-center gap-1.5">
                    <i className={cx('size-2.5 rounded-full', catColors[i])} aria-hidden />
                    {c} <Money paise={v} className="font-medium text-text" />
                  </li>
                ))}
                {cats.length > 4 && <li>+{cats.length - 4} more</li>}
              </ul>
            </Card>
          )}

          {forLabel && r.ok && (r.forInPaise > 0 || r.forUsedPaise > 0 || s.forBalancePaise !== 0) && (
            <Card>
              <h2 className="text-[15px] font-semibold">{forLabel}'s money</h2>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-[13px] text-muted">Received</dt>
                  <dd><Money paise={r.forInPaise} className="font-semibold" /></dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Used for bills</dt>
                  <dd><Money paise={r.forUsedPaise} className="font-semibold" /></dd>
                </div>
                <div className="text-right">
                  <dt className="text-[13px] text-muted">Left now</dt>
                  <dd><Money paise={s.forBalancePaise} className={cx('font-bold', s.forBalancePaise < 0 ? 'text-pays' : 'text-gets')} /></dd>
                </div>
              </dl>
            </Card>
          )}

          {s.entries.length === 0 && <p className="py-6 text-center text-sm text-muted">No bills yet this month. Tap + to add the first one.</p>}
          {[...byDay].map(([day, list]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-muted">{dayLabel(day)}</h2>
              <Card flush>
                <Rows>
                  {list.map((e) => {
                    const title =
                      e.type === 'money_given'
                        ? `${name(e.paidByMemberId)} gave ${name(e.toMemberId)}`
                        : e.type === 'money_in'
                          ? e.note || `Money in for ${forLabel ?? 'the Hisaab'}`
                          : e.note || e.category || 'Bill'
                    const sub =
                      e.type === 'bill'
                        ? `${e.paidByMemberId ? `Paid by ${e.paidByMemberId === s.me.memberId ? 'you' : name(e.paidByMemberId)}` : `From ${name(null)}`}${e.category ? ` · ${e.category}` : ''}`
                        : e.type === 'refund'
                          ? `Refund to ${name(e.toMemberId)}`
                          : e.type === 'money_in'
                            ? 'Money in · not divided'
                            : e.note || 'Money given'
                    return (
                      <Row
                        key={e.id}
                        to="/sheets/$id/entries/$entryId"
                        params={{ id: s.sheet.id, entryId: e.id }}
                        left={<IconTile icon={entryIcon(e)} tone={e.type === 'money_in' ? 'gets' : 'brand'} />}
                        title={title}
                        subtitle={e.late ? `Late: dated ${shortDate(e.date)} · ${sub}` : sub}
                        right={<Money paise={e.amountPaise} sign={e.type === 'money_in'} className={cx('text-[15px] font-semibold', (e.type === 'money_in' || e.type === 'refund') && 'text-gets')} />}
                      />
                    )
                  })}
                </Rows>
              </Card>
            </section>
          ))}
        </>
      )}

      {tab === 'shares' &&
        (r.ok ? (
          <Card flush>
            <Rows>
              {r.members.map((m) => {
                const p = s.participants.find((x) => x.memberId === m.memberId)
                const tag = p && exceptionTag(p)
                return (
                  <Row
                    key={m.memberId}
                    left={<Avatar name={name(m.memberId)} id={m.memberId} />}
                    title={
                      <span className="flex items-center gap-1.5">
                        {name(m.memberId)}
                        {tag && <Tag tone="marigold">{tag}</Tag>}
                      </span>
                    }
                    subtitle={`Paid ${formatRupees(m.paidPaise)} · share ${formatRupees(m.obligationPaise)}`}
                    right={
                      <span className={cx('num text-[15px] font-semibold', m.netPaise > 0 ? 'text-gets' : m.netPaise < 0 ? 'text-pays' : 'text-muted')}>
                        {m.netPaise > 0 ? `gets ${formatRupees(m.netPaise)}` : m.netPaise < 0 ? `pays ${formatRupees(-m.netPaise)}` : 'settled'}
                      </span>
                    }
                  />
                )
              })}
            </Rows>
          </Card>
        ) : (
          <Card className="text-sm text-pays">{r.message}</Card>
        ))}

      {!open && s.me.role === 'admin' && active && (
        <>
          <Button
            variant="ghost"
            icon={RotateCcw}
            onClick={() => confirm('Reopen this month? Payments already marked paid are kept as "Money given". Unpaid ones are removed until you close again.') && reopen.mutate()}
          >
            Reopen this month
          </Button>
          <ErrorBox error={reopen.error} />
        </>
      )}

      <ShareSheet s={s} open={shareOpen} onClose={() => setShareOpen(false)} />
    </Page>
  )
}

function ShareSheet({ s, open, onClose }: { s: SheetView; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sheet', s.sheet.id] })
  const make = useMutation({ mutationFn: () => call(api.sheets[':id'].statement.$post({ param: { id: s.sheet.id } })), onSuccess: refresh })
  const revoke = useMutation({ mutationFn: (sid: string) => call(api.statements[':id'].$delete({ param: { id: sid } })), onSuccess: refresh })
  const statement = s.statement
  return (
    <Sheet open={open} onClose={onClose} title={`Share ${s.sheet.name.split(' ')[0]}`}>
      <p className="text-sm text-muted">A read-only page with every entry and how it was divided. Anyone with the link can see it (no login); UPI IDs are never shown.</p>
      {statement ? (
        <>
          <p className="rounded-xl bg-paper p-3 text-sm break-all">{statement.link}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(statement.link)}>
              Copy link
            </Button>
            {s.share ? (
              <a href={s.share.waLink} target="_blank" rel="noreferrer" className="press inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-gets font-semibold text-on-gets">
                <MessageCircle className="size-5" aria-hidden />
                WhatsApp
              </a>
            ) : typeof navigator.share === 'function' ? (
              <Button onClick={() => navigator.share({ title: `${s.hisaab.name} – ${s.sheet.name}`, url: statement.link })}>Share</Button>
            ) : null}
          </div>
          <Button variant="ghost" className="text-pays" onClick={() => confirm('Turn off this link? People who have it will not be able to open it.') && revoke.mutate(statement.id)}>
            Turn off link
          </Button>
        </>
      ) : (
        <Button onClick={() => make.mutate()} disabled={make.isPending}>
          Make a share link
        </Button>
      )}
      <ErrorBox error={make.error ?? revoke.error} />
    </Sheet>
  )
}
