import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Plus, Send, UserPlus, Wallet } from 'lucide-react'
import { api, call, type GroupView } from '../../../../api.ts'
import { groupQuery } from '../../../../queries.ts'
import { Avatar, Button, Card, ErrorBox, Field, Input, Loading, Page, Row, Rows, SectionTitle, Segmented, Select, Sheet } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/$id/settings')({ component: SettingsPage })

type Member = GroupView['members'][number]

function SettingsPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(groupQuery(id))
  if (isPending) return <Loading />
  if (!data || data.pending) return <Page title="Settings" back={`/groups/${id}`}><ErrorBox error={error} /></Page>
  return <Settings g={data} />
}

function memberNote(m: Member) {
  const parts = [
    m.status === 'pending' ? 'Waiting for approval' : m.status === 'deleted' ? 'Account deleted' : m.status === 'former' ? 'Left' : m.placeholder ? 'Not joined yet' : m.role === 'admin' ? 'Admin' : 'Joined',
    m.defaultWeight !== 100 && `${m.defaultWeight / 100} shares`,
  ]
  return parts.filter(Boolean).join(' · ')
}

function Settings({ g }: { g: GroupView }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const active = g.me.status === 'active'
  const isAdmin = g.me.role === 'admin' && active
  const [panel, setPanel] = useState<'invite' | 'member' | 'fund' | 'name' | null>(null)
  const [picked, setPicked] = useState<Member | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['group', g.id] })

  const update = useMutation({ mutationFn: (json: { name?: string; settleMode?: 'as_you_go' | 'monthly'; joinApproval?: boolean }) => call(api.groups[':id'].$patch({ param: { id: g.id }, json })), onSuccess: refresh })
  const approve = useMutation({ mutationFn: (mid: string) => call(api.groups[':id'].members[':mid'].approve.$post({ param: { id: g.id, mid } })), onSuccess: refresh })
  const leave = useMutation({
    mutationFn: () => call(api.groups[':id'].members[':mid'].$delete({ param: { id: g.id, mid: g.me.memberId } })),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate({ to: '/groups' })
    },
  })

  return (
    <Page title="Members and settings" subtitle={g.name} back={`/groups/${g.id}`}>
      {active && (
        <Button icon={UserPlus} onClick={() => setPanel('invite')}>
          Invite people
        </Button>
      )}

      <SectionTitle>Members</SectionTitle>
      <Card flush>
        <Rows>
          {g.members.map((m) => (
            <Row
              key={m.id}
              onClick={active && m.status === 'active' ? () => setPicked(m) : undefined}
              left={<Avatar name={m.name} id={m.id} muted={m.placeholder || m.status !== 'active'} />}
              title={m.isMe ? `${m.name} (you)` : m.name}
              subtitle={memberNote(m)}
              right={
                isAdmin && m.status === 'pending' ? (
                  <Button size="sm" onClick={() => approve.mutate(m.id)} disabled={approve.isPending}>
                    Approve
                  </Button>
                ) : m.placeholder && active ? (
                  <Send className="size-5 text-brand-text" aria-label="Not joined yet" />
                ) : undefined
              }
            />
          ))}
          {isAdmin && (
            <button type="button" onClick={() => setPanel('member')} className="press flex min-h-14 w-full items-center gap-3 font-semibold text-brand-text">
              <Plus className="size-5" aria-hidden />
              Add a member
            </button>
          )}
        </Rows>
      </Card>
      <ErrorBox error={approve.error} />

      <SectionTitle>Funds</SectionTitle>
      <Card>
        <p className="text-sm text-muted">Money held for the group, like a parent's pension or a trip kitty. Add money in, pay bills from it, see what is left. It never changes anyone's balance.</p>
        {g.funds.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-[15px]">
            {g.funds.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <Wallet className="size-4 text-faint" aria-hidden />
                {f.name}
              </li>
            ))}
          </ul>
        )}
        {active && (
          <Button size="sm" variant="secondary" icon={Plus} className="mt-3" onClick={() => setPanel('fund')}>
            Add a fund
          </Button>
        )}
      </Card>

      {isAdmin && (
        <>
          <SectionTitle>Group</SectionTitle>
          <Card className="flex flex-col gap-4">
            <Field label="How do you settle?" group hint={g.settleMode === 'monthly' ? 'Bills are divided at month end.' : 'Each expense is split when you add it.'}>
              <Segmented
                label="How do you settle?"
                value={g.settleMode}
                onChange={(v) => confirm(v === 'monthly' ? 'Divide bills once a month from now on?' : 'Split each expense as you add it from now on?') && update.mutate({ settleMode: v })}
                options={[
                  { value: 'as_you_go', label: 'As you go' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
            </Field>
            <Field label="New members by link" group>
              <Segmented
                label="New members by link"
                value={g.joinApproval ? 'approve' : 'open'}
                onChange={(v) => update.mutate({ joinApproval: v === 'approve' })}
                options={[
                  { value: 'open', label: 'Join straight in' },
                  { value: 'approve', label: 'I approve' },
                ]}
              />
            </Field>
            <Button variant="secondary" onClick={() => setPanel('name')}>
              Rename group
            </Button>
            <ErrorBox error={update.error} />
          </Card>
        </>
      )}

      {active && (
        <Button variant="ghost" icon={LogOut} className="text-pays" onClick={() => confirm(`Leave ${g.name}?`) && leave.mutate()}>
          Leave this group
        </Button>
      )}
      <ErrorBox error={leave.error} />

      <InviteSheet g={g} open={panel === 'invite'} onClose={() => setPanel(null)} />
      {panel === 'member' && <AddMemberSheet groupId={g.id} onClose={() => setPanel(null)} />}
      {panel === 'fund' && <FundSheet g={g} onClose={() => setPanel(null)} />}
      {panel === 'name' && <RenameSheet g={g} onClose={() => setPanel(null)} />}
      {picked && <MemberSheet g={g} m={picked} isAdmin={isAdmin} onClose={() => setPicked(null)} />}
    </Page>
  )
}

function InviteSheet({ g, open, onClose }: { g: GroupView; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const make = useMutation({
    mutationFn: () => call(api.groups[':id'].invite.$post({ param: { id: g.id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', g.id] }),
  })
  const link = make.data?.link ?? g.inviteLink
  const text = `Join "${g.name}" on PaiseGuru to split our expenses: ${link}`
  return (
    <Sheet open={open} onClose={onClose} title="Invite people">
      <p className="text-sm text-muted">Send this link. People sign up, pick their name if you added it, and {g.joinApproval ? 'you approve them' : 'join straight in'}.</p>
      {link ? (
        <>
          <p className="rounded-xl bg-paper p-3 text-sm break-all">{link}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link)}>
              Copy link
            </Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="press inline-flex h-[52px] items-center justify-center rounded-[14px] bg-gets font-semibold text-on-gets">
              WhatsApp
            </a>
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

function AddMemberSheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => call(api.groups[':id'].members.$post({ param: { id: groupId }, json: { name } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      onClose()
    },
  })
  return (
    <Sheet open onClose={onClose} title="Add a member">
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

function FundSheet({ g, onClose }: { g: GroupView; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [holder, setHolder] = useState('')
  const add = useMutation({
    mutationFn: () => call(api.groups[':id'].funds.$post({ param: { id: g.id }, json: { name, holderMemberId: holder || null } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', g.id] })
      onClose()
    },
  })
  return (
    <Sheet open onClose={onClose} title="Add a fund">
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), name.trim() && add.mutate())}>
        <Field label="Name" hint="For example: Mom's pension, Trip kitty, Flat deposit">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="off" />
        </Field>
        <Field label="Who holds the money? (optional)">
          <Select value={holder} onChange={(e) => setHolder(e.target.value)}>
            <option value="">Nobody in particular</option>
            {g.members
              .filter((m) => m.status === 'active')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </Select>
        </Field>
        <ErrorBox error={add.error} />
        <Button type="submit" disabled={add.isPending}>
          Add fund
        </Button>
      </form>
    </Sheet>
  )
}

function RenameSheet({ g, onClose }: { g: GroupView; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(g.name)
  const save = useMutation({
    mutationFn: () => call(api.groups[':id'].$patch({ param: { id: g.id }, json: { name } })),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
  })
  return (
    <Sheet open onClose={onClose} title="Rename group">
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </Field>
        <ErrorBox error={save.error} />
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </form>
    </Sheet>
  )
}

function MemberSheet({ g, m, isAdmin, onClose }: { g: GroupView; m: Member; isAdmin: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [weight, setWeight] = useState(String(m.defaultWeight / 100))
  const act = useMutation({
    mutationFn: (p: Promise<Response>) => call(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', g.id] })
      onClose()
    },
  })
  const placeholders = g.members.filter((x) => x.placeholder)
  const real = !m.placeholder
  const canManage = isAdmin && !m.isMe
  return (
    <Sheet open onClose={onClose} title={m.name}>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const w = Math.round(Number(weight) * 100)
          if (w > 0 && w <= 10_000) act.mutate(api.groups[':id'].members[':mid'].$patch({ param: { id: g.id, mid: m.id }, json: { defaultWeight: w } }))
        }}
      >
        <Field label="Shares when splitting by shares" hint="For example 2 for a couple. Used as the starting value.">
          <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="num" />
        </Field>
        <Button type="submit" variant="secondary" disabled={act.isPending}>
          Save
        </Button>
      </form>
      {canManage && (
        <div className="flex flex-col gap-2">
          {real && (
            <Button variant="secondary" onClick={() => confirm(`Make ${m.name} the admin? You will stop being the admin.`) && act.mutate(api.groups[':id'].admin.$post({ param: { id: g.id }, json: { memberId: m.id } }))}>
              Make admin
            </Button>
          )}
          {real && (
            <Button variant="secondary" onClick={() => confirm(`${m.name} will become a name without an account again.`) && act.mutate(api.groups[':id'].members[':mid'].unclaim.$post({ param: { id: g.id, mid: m.id } }))}>
              Undo join (wrong name)
            </Button>
          )}
          {real && placeholders.length > 0 && (
            <Field label="This person is really…" hint="Their expenses join that name's expenses.">
              <Select
                value=""
                onChange={(e) =>
                  e.target.value &&
                  confirm(`Link ${m.name} to ${placeholders.find((p) => p.id === e.target.value)?.name}?`) &&
                  act.mutate(api.groups[':id'].members[':mid'].merge.$post({ param: { id: g.id, mid: m.id }, json: { placeholderId: e.target.value } }))
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
          <Button variant="danger" onClick={() => confirm(`Remove ${m.name} from ${g.name}?`) && act.mutate(api.groups[':id'].members[':mid'].$delete({ param: { id: g.id, mid: m.id } }))}>
            Remove from group
          </Button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </Sheet>
  )
}
