import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, HandCoins, MessageCircle, Plus, RotateCcw, Share2 } from 'lucide-react'
import { formatRupees } from '../../../../../domain/money.ts'
import { api, call, type SheetView } from '../../../../api.ts'
import { ExpenseList } from '../../../../expense-list.tsx'
import { sheetQuery } from '../../../../queries.ts'
import { Avatar, Button, Card, ErrorBox, IconButton, Loading, Money, Page, Row, Rows, Segmented, Sheet, StateTag, Tag, askConfirm, cx } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/sheets/$id/')({ component: SheetPage })

function SheetPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(sheetQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Month" back="/groups"><ErrorBox error={error} /></Page>
  return <Month s={data} />
}

const exceptionTag = (p: { exception: string; exceptionPaise: number }) =>
  p.exception === 'fixed' ? `Fixed ${formatRupees(p.exceptionPaise)}` : p.exception === 'extra' ? `+${formatRupees(p.exceptionPaise)} extra` : p.exception === 'skip' ? 'Skips' : null

function Month({ s }: { s: SheetView }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'bills' | 'shares'>('bills')
  const [shareOpen, setShareOpen] = useState(false)
  const open = s.sheet.state === 'open'
  const active = s.me.status === 'active'
  const r = s.result
  const name = (id: string) => s.names[id] ?? ''
  const monthShort = s.sheet.name.split(' ')[0]
  const reopen = useMutation({
    mutationFn: () => call(api.sheets[':id'].reopen.$post({ param: { id: s.sheet.id }, json: { version: s.sheet.version } })),
    onSettled: () => queryClient.invalidateQueries(),
  })

  const cats = r.ok ? Object.entries(r.categories).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : []
  const catTotal = cats.reduce((t, [, v]) => t + v, 0)
  const catColors = ['bg-brand', 'bg-brand-2', 'bg-cat-3', 'bg-field'] // never gets/pays: those mean money owed

  return (
    <Page
      title={monthShort}
      subtitle={`${s.group.name} · ${s.entries.length} ${s.entries.length === 1 ? 'entry' : 'entries'}`}
      back={`/groups/${s.group.id}`}
      action={active && <IconButton icon={Share2} label="Share this month" soft onClick={() => setShareOpen(true)} />}
    >
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption text-muted">{open ? 'Total so far' : 'Total'}</p>
            {r.ok ? <Money paise={r.totalPaise} className="text-hero font-bold tracking-tight" /> : <p className="mt-1 text-body text-pays">{r.message}</p>}
          </div>
          <StateTag state={s.sheet.state} />
        </div>
        {r.ok && r.dividablePaise !== r.totalPaise && (
          <p className="mt-1 text-caption text-muted">
            <Money paise={r.dividablePaise} /> divided · the rest was split already or paid from a fund
          </p>
        )}
        {open && active && (
          <div className="mt-3.5 flex gap-2">
            <Link to="/groups/$id/add" params={{ id: s.group.id }} className="press inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-body font-semibold text-on-brand">
              <Plus className="size-4" aria-hidden />
              Add expense
            </Link>
            <Link to="/sheets/$id/close" params={{ id: s.sheet.id }} className="press inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-body font-semibold text-brand-text">
              <CheckCheck className="size-4" aria-hidden />
              Close month
            </Link>
          </div>
        )}
        {!open && active && (
          <div className="mt-3.5 flex gap-2">
            {s.share && (
              <a href={s.share.waLink} target="_blank" rel="noreferrer" className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gets text-body font-semibold text-on-gets">
                <MessageCircle className="size-4" aria-hidden />
                Share result
              </a>
            )}
            <Link to="/groups/$id/settle" params={{ id: s.group.id }} className="press inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-body font-semibold text-brand-text">
              <HandCoins className="size-4" aria-hidden />
              Settle up
            </Link>
          </div>
        )}
      </Card>

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
              <p className="text-caption text-muted">By category</p>
              <div className="my-2.5 flex h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
                {cats.slice(0, 4).map(([c, v], i) => (
                  <i key={c} className={catColors[i]} style={{ width: `${(v / catTotal) * 100}%` }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
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

          {r.ok &&
            Object.entries(r.funds).map(([fid, f]) => (
              <Card key={fid}>
                <h2 className="text-body font-semibold">{s.fundNames[fid] ?? 'Fund'} this month</h2>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-caption text-muted">Money in</dt>
                    <dd><Money paise={f.inPaise} className="font-semibold" /></dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-caption text-muted">Used for bills</dt>
                    <dd><Money paise={f.usedPaise} className="font-semibold" /></dd>
                  </div>
                </dl>
              </Card>
            ))}

          <ExpenseList expenses={s.entries} names={s.names} fundNames={s.fundNames} meId={s.me.memberId} groupId={s.group.id} empty="No bills yet this month. Tap Add expense to add the first one." />
        </>
      )}

      {tab === 'shares' &&
        (r.ok ? (
          <>
            <Card flush>
              <Rows>
                {r.members.map((m) => {
                  const p = s.participants.find((x) => x.memberId === m.memberId)
                  const tag = p && exceptionTag(p)
                  const month = m.paidPaise - m.obligationPaise
                  return (
                    <Row
                      key={m.memberId}
                      left={<Avatar name={name(m.memberId)} me={m.memberId === s.me.memberId} />}
                      title={
                        <span className="flex items-center gap-1.5">
                          {name(m.memberId)}
                          {tag && <Tag tone="marigold">{tag}</Tag>}
                        </span>
                      }
                      subtitle={`Paid ${formatRupees(m.paidPaise)} · share ${formatRupees(m.obligationPaise)}`}
                      right={
                        <span className={cx('num text-body font-semibold', month > 0 ? 'text-gets' : month < 0 ? 'text-pays' : 'text-muted')}>
                          {month > 0 ? `gets ${formatRupees(month)}` : month < 0 ? `pays ${formatRupees(-month)}` : 'even'}
                        </span>
                      }
                    />
                  )
                })}
              </Rows>
            </Card>
            <p className="text-caption text-muted">{open ? 'If the month were closed today. ' : ''}Bills split on their own are not in these shares; see Settle up for everyone's balance.</p>
          </>
        ) : (
          <Card className="text-body text-pays">{r.message}</Card>
        ))}

      {!open && s.me.role === 'admin' && active && (
        <>
          <Button variant="ghost" icon={RotateCcw} onClick={async () => (await askConfirm({ title: 'Reopen this month?', text: 'Its shares come off the balances until you close it again. Payments stay as they are.', confirm: 'Reopen month' })) && reopen.mutate()}>
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
      <p className="text-body text-muted">A read-only page with every entry and how it was divided. Anyone with the link can see it (no login); UPI IDs are never shown.</p>
      {statement ? (
        <>
          <p className="rounded-xl bg-paper p-3 text-body break-all">{statement.link}</p>
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
              <Button onClick={() => navigator.share({ title: `${s.group.name} – ${s.sheet.name}`, url: statement.link })}>Share</Button>
            ) : null}
          </div>
          <Button variant="ghost" className="text-pays" onClick={async () => (await askConfirm({ title: 'Turn off this link?', text: 'People who have it will not be able to open it.', confirm: 'Turn off link', danger: true })) && revoke.mutate(statement.id)}>
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
