import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, ChevronRight, LogOut, Plus, Send, UserPlus, Wallet } from 'lucide-react'
import { api, call, type HisaabView } from '../../../../api.ts'
import { hisaabQuery } from '../../../../queries.ts'
import { Avatar, Button, Card, ErrorBox, Field, IconButton, Input, Loading, Money, Page, Row, Rows, Select, Sheet, Tag, cx } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/hisaabs/$id/')({ component: HisaabPage })

type Member = HisaabView['members'][number]

function HisaabPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(hisaabQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Hisaab" back="/hisaabs"><ErrorBox error={error} /></Page>
  if (data.pending) {
    return (
      <Page title={data.name} back="/hisaabs">
        <Card>You asked to join. You'll see everything once the admin approves you.</Card>
      </Page>
    )
  }
  return <HisaabDetail h={data} />
}

function memberNote(m: Member) {
  if (m.status === 'pending') return 'Waiting for approval'
  if (m.status === 'deleted') return 'Account deleted'
  if (m.placeholder) return 'Not joined yet'
  return m.role === 'admin' ? 'Admin' : 'Joined'
}

function HisaabDetail({ h }: { h: HisaabView }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const active = h.me.status === 'active'
  const isAdmin = h.me.role === 'admin' && active
  const [sheetId, setSheetId] = useState(h.sheets[0]?.id)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [picked, setPicked] = useState<Member | null>(null)
  const s = h.sheets.find((x) => x.id === sheetId) ?? h.sheets[0]
  const sharers = h.members.filter((m) => m.status === 'active').length
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hisaab', h.id] })

  const approve = useMutation({ mutationFn: (mid: string) => call(api.hisaabs[':id'].members[':mid'].approve.$post({ param: { id: h.id, mid } })), onSuccess: refresh })
  const leave = useMutation({
    mutationFn: () => call(api.hisaabs[':id'].members[':mid'].$delete({ param: { id: h.id, mid: h.me.memberId } })),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate({ to: '/hisaabs' })
    },
  })

  return (
    <Page
      title={h.name}
      subtitle={[h.forLabel && `For ${h.forLabel}`, isAdmin ? "you're the admin" : `${sharers} members`].filter(Boolean).join(' · ')}
      back="/hisaabs"
      action={active && <IconButton icon={UserPlus} label="Invite members" soft onClick={() => setInviteOpen(true)} />}
    >
      {!active && <Card className="bg-marigold-soft text-sm">You have left this Hisaab. You can still look at the months you were part of.</Card>}

      {h.sheets.length > 1 && (
        <div role="radiogroup" aria-label="Month" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {h.sheets.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === s?.id}
              onClick={() => setSheetId(x.id)}
              className={cx('press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium', x.id === s?.id ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card')}
            >
              {x.name.split(' ')[0]}
              {x.unpaidCount > 0 && <Tag tone="marigold">{x.unpaidCount}</Tag>}
            </button>
          ))}
        </div>
      )}

      {s && (
        <section className="rounded-2xl bg-brand p-4 text-on-brand">
          <Link to="/sheets/$id" params={{ id: s.id }} className="press block">
            <p className="flex items-center justify-between text-[13px] opacity-80">
              {s.name} · {s.state === 'open' ? 'open' : s.unpaidCount ? `${s.unpaidCount} to pay` : 'settled'}
              <ChevronRight className="size-5" aria-hidden />
            </p>
            <Money paise={s.totalPaise} className="mt-1 block text-[40px] leading-tight font-bold tracking-tight" />
            <p className="mt-1 text-[13px] opacity-80">
              {s.entryCount} {s.entryCount === 1 ? 'entry' : 'entries'}
              {h.forLabel && s.forUsedPaise > 0 && <> · <Money paise={s.forUsedPaise} /> from {h.forLabel}'s money</>}
            </p>
          </Link>
          {active && s.state === 'open' && (
            <div className="mt-3.5 flex gap-2">
              <Link to="/hisaabs/$id/add" params={{ id: h.id }} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-marigold text-sm font-semibold text-on-marigold">
                <Plus className="size-4" aria-hidden />
                Add bill
              </Link>
              <Link to="/sheets/$id/close" params={{ id: s.id }} className="press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 text-sm font-semibold">
                <CheckCheck className="size-4" aria-hidden />
                Close month
              </Link>
            </div>
          )}
        </section>
      )}

      {h.forLabel && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">{h.forLabel}'s money</h2>
            <Wallet className="size-5 text-faint" aria-hidden />
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[13px] text-muted">In ({s?.name.split(' ')[0]})</dt>
              <dd><Money paise={s?.forInPaise ?? 0} className="font-semibold" /></dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Used for bills</dt>
              <dd><Money paise={s?.forUsedPaise ?? 0} className="font-semibold" /></dd>
            </div>
            <div className="text-right">
              <dt className="text-[13px] text-muted">Left now</dt>
              <dd><Money paise={h.forBalancePaise} className={cx('font-bold', h.forBalancePaise < 0 ? 'text-pays' : 'text-gets')} /></dd>
            </div>
          </dl>
          <p className="mt-2 text-[13px] text-muted">Pension and other money in, minus bills paid from it. Never divided.</p>
        </Card>
      )}

      <Card flush>
        <Rows>
          {h.members.map((m) => {
            const canManage = isAdmin && !m.isMe && m.status !== 'deleted' && m.status !== 'former'
            return (
              <Row
                key={m.id}
                onClick={canManage ? () => setPicked(m) : undefined}
                left={<Avatar name={m.name} id={m.id} muted={m.placeholder || m.status !== 'active'} />}
                title={m.isMe ? `${m.name} (you)` : m.name}
                subtitle={memberNote(m)}
                right={
                  isAdmin && m.status === 'pending' ? (
                    <Button size="sm" onClick={() => approve.mutate(m.id)} disabled={approve.isPending}>
                      Approve
                    </Button>
                  ) : m.placeholder && active ? (
                    <Send className="size-5 text-brand-text" aria-label="Invite" />
                  ) : undefined
                }
              />
            )
          })}
          {isAdmin && (
            <button type="button" onClick={() => setAddOpen(true)} className="press flex min-h-14 w-full items-center gap-3 font-semibold text-brand-text">
              <Plus className="size-5" aria-hidden />
              Add a member
            </button>
          )}
        </Rows>
      </Card>
      <ErrorBox error={approve.error} />

      {active && (
        <Button variant="ghost" icon={LogOut} className="text-pays" onClick={() => confirm(`Leave ${h.name}?`) && leave.mutate()}>
          Leave this Hisaab
        </Button>
      )}
      <ErrorBox error={leave.error} />

      <InviteSheet h={h} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <AddMemberSheet hisaabId={h.id} open={addOpen} onClose={() => setAddOpen(false)} />
      {picked && <MemberSheet h={h} m={picked} onClose={() => setPicked(null)} />}
    </Page>
  )
}

function InviteSheet({ h, open, onClose }: { h: HisaabView; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const make = useMutation({
    mutationFn: () => call(api.hisaabs[':id'].invite.$post({ param: { id: h.id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hisaab', h.id] }),
  })
  const link = make.data?.link ?? h.inviteLink
  const text = `Join "${h.name}" on PaiseGuru: ${link}`
  return (
    <Sheet open={open} onClose={onClose} title="Invite members">
      <p className="text-sm text-muted">Send this link to family members. They sign in, pick their name, and {h.joinApproval ? 'you approve them' : 'join'}.</p>
      {link ? (
        <>
          <p className="rounded-xl bg-paper p-3 text-sm break-all">{link}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link)}>
              Copy link
            </Button>
            {typeof navigator.share === 'function' ? (
              <Button onClick={() => navigator.share({ title: 'PaiseGuru', text })}>Share</Button>
            ) : (
              <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="press inline-flex h-[52px] items-center justify-center rounded-[14px] bg-gets font-semibold text-on-gets">
                WhatsApp
              </a>
            )}
          </div>
          <Button variant="ghost" onClick={() => confirm('The old link will stop working. Make a new one?') && make.mutate()}>
            Make a new link
          </Button>
        </>
      ) : (
        <Button onClick={() => make.mutate()} disabled={make.isPending}>
          Get invite link
        </Button>
      )}
      <ErrorBox error={make.error} />
    </Sheet>
  )
}

function AddMemberSheet({ hisaabId, open, onClose }: { hisaabId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => call(api.hisaabs[':id'].members.$post({ param: { id: hisaabId }, json: { name } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hisaab', hisaabId] })
      setName('')
      onClose()
    },
  })
  return (
    <Sheet open={open} onClose={onClose} title="Add a member">
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), name.trim() && add.mutate())}>
        <Field label="Name" hint="They don't need the app now. They can join later with the invite link and pick this name.">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="off" />
        </Field>
        <ErrorBox error={add.error} />
        <Button type="submit" disabled={add.isPending}>
          Add member
        </Button>
      </form>
    </Sheet>
  )
}

function MemberSheet({ h, m, onClose }: { h: HisaabView; m: Member; onClose: () => void }) {
  const queryClient = useQueryClient()
  const act = useMutation({
    mutationFn: (p: Promise<Response>) => call(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hisaab', h.id] })
      onClose()
    },
  })
  const placeholders = h.members.filter((x) => x.placeholder)
  const real = !m.placeholder
  return (
    <Sheet open onClose={onClose} title={m.name}>
      <div className="flex flex-col gap-2">
        {real && m.status === 'active' && (
          <Button variant="secondary" onClick={() => confirm(`Make ${m.name} the admin? You will stop being the admin.`) && act.mutate(api.hisaabs[':id'].admin.$post({ param: { id: h.id }, json: { memberId: m.id } }))}>
            Make admin
          </Button>
        )}
        {real && (
          <Button variant="secondary" onClick={() => confirm(`${m.name} will become a name without an account again.`) && act.mutate(api.hisaabs[':id'].members[':mid'].unclaim.$post({ param: { id: h.id, mid: m.id } }))}>
            Undo join (wrong name)
          </Button>
        )}
        {real && m.status === 'active' && placeholders.length > 0 && (
          <Field label="This person is really…" hint="Their entries join that name's entries.">
            <Select
              value=""
              onChange={(e) =>
                e.target.value &&
                confirm(`Link ${m.name} to ${placeholders.find((p) => p.id === e.target.value)?.name}?`) &&
                act.mutate(api.hisaabs[':id'].members[':mid'].merge.$post({ param: { id: h.id, mid: m.id }, json: { placeholderId: e.target.value } }))
              }
            >
              <option value="">Pick a name</option>
              {placeholders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button variant="danger" onClick={() => confirm(`Remove ${m.name} from ${h.name}?`) && act.mutate(api.hisaabs[':id'].members[':mid'].$delete({ param: { id: h.id, mid: m.id } }))}>
          Remove from Hisaab
        </Button>
      </div>
      <ErrorBox error={act.error} />
    </Sheet>
  )
}
