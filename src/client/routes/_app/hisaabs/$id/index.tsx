import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, call, type HisaabView } from '../../../../api.ts'
import { hisaabQuery } from '../../../../queries.ts'
import { Button, ButtonLink, Card, ErrorBox, Input, Loading, Money, Page, Select, StateTag, Tag } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/hisaabs/$id/')({ component: HisaabPage })

type Member = HisaabView['members'][number]

function HisaabPage() {
  const { id } = Route.useParams()
  const { data, error, isPending } = useQuery(hisaabQuery(id))
  if (isPending) return <Loading />
  if (!data) return <Page title="Hisaab" back><ErrorBox error={error} /></Page>
  if (data.pending) {
    return (
      <Page title={data.name} back>
        <Card>Waiting for the admin to approve you. You will see everything once they do.</Card>
      </Page>
    )
  }
  return <HisaabDetail h={data} />
}

function HisaabDetail({ h }: { h: HisaabView }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hisaab', h.id] })
  const active = h.me.status === 'active'
  const isAdmin = h.me.role === 'admin' && active
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const act = useMutation({
    mutationFn: (p: Promise<Response>) => call(p),
    onSuccess: refresh,
  })
  const invite = useMutation({ mutationFn: () => call(api.hisaabs[':id'].invite.$post({ param: { id: h.id } })), onSuccess: refresh })
  const leave = useMutation({
    mutationFn: () => call(api.hisaabs[':id'].members[':mid'].$delete({ param: { id: h.id, mid: h.me.memberId } })),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate({ to: '/' })
    },
  })
  const placeholders = h.members.filter((m) => m.placeholder)

  function memberActions(m: Member) {
    const acts: { label: string; run: () => Promise<Response>; confirm?: string }[] = []
    if (isAdmin && m.status === 'pending') acts.push({ label: 'Approve', run: () => api.hisaabs[':id'].members[':mid'].approve.$post({ param: { id: h.id, mid: m.id } }) })
    if (isAdmin && !m.isMe && !m.placeholder && m.status === 'active') {
      acts.push({ label: 'Make admin', confirm: `Make ${m.name} the admin? You will stop being the admin.`, run: () => api.hisaabs[':id'].admin.$post({ param: { id: h.id }, json: { memberId: m.id } }) })
    }
    if (isAdmin && !m.isMe && !m.placeholder && (m.status === 'active' || m.status === 'pending')) {
      acts.push({ label: 'Undo join (wrong name)', confirm: `${m.name} will be a name without an account again.`, run: () => api.hisaabs[':id'].members[':mid'].unclaim.$post({ param: { id: h.id, mid: m.id } }) })
    }
    if (active && !m.isMe && (m.status === 'active' || m.status === 'pending')) {
      acts.push({ label: 'Remove', confirm: `Remove ${m.name} from ${h.name}?`, run: () => api.hisaabs[':id'].members[':mid'].$delete({ param: { id: h.id, mid: m.id } }) })
    }
    return acts
  }

  return (
    <Page title={h.name} back>
      {h.forLabel && <p className="-mt-2 text-sm text-slate-500">For {h.forLabel}</p>}
      {!active && <Card className="bg-amber-50 text-sm">You have left this Hisaab. You can still look at the months you were part of.</Card>}

      {active && (
        <ButtonLink to="/hisaabs/$id/add" params={{ id: h.id }} className="w-full">
          + Add a bill
        </ButtonLink>
      )}

      <Card>
        <h2 className="mb-1 font-semibold">Months</h2>
        <ul className="divide-y divide-slate-100">
          {h.sheets.map((s) => (
            <li key={s.id}>
              <Link to="/sheets/$id" params={{ id: s.id }} className="flex min-h-12 items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {s.name} <StateTag state={s.state} />
                </span>
                <Money paise={s.totalPaise} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Members</h2>
        <ul className="divide-y divide-slate-100">
          {h.members.map((m) => {
            const acts = memberActions(m)
            return (
              <li key={m.id} className="py-2">
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {m.name}
                    {m.isMe && <span className="text-sm text-slate-500">(you)</span>}
                    {m.role === 'admin' && <Tag tone="brand">admin</Tag>}
                    {m.placeholder && <Tag>not joined</Tag>}
                    {m.status === 'pending' && <Tag tone="amber">waiting for approval</Tag>}
                    {m.status === 'deleted' && <Tag>account deleted</Tag>}
                  </span>
                  {acts.length > 0 && (
                    <button className="min-h-11 px-2 text-sm text-brand" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                      {open === m.id ? 'Close' : 'Options'}
                    </button>
                  )}
                </div>
                {open === m.id && (
                  <div className="flex flex-wrap gap-2 pb-1">
                    {acts.map((a) => (
                      <Button
                        key={a.label}
                        variant={a.label === 'Remove' ? 'danger' : 'secondary'}
                        className="text-sm"
                        onClick={() => (!a.confirm || confirm(a.confirm)) && act.mutate(a.run())}
                      >
                        {a.label}
                      </Button>
                    ))}
                    {isAdmin && !m.isMe && !m.placeholder && m.status === 'active' && placeholders.length > 0 && (
                      <Select
                        aria-label={`${m.name} is really`}
                        className="text-sm"
                        value=""
                        onChange={(e) =>
                          e.target.value &&
                          confirm(`Link ${m.name} to ${placeholders.find((p) => p.id === e.target.value)?.name}? Their entries become one person.`) &&
                          act.mutate(api.hisaabs[':id'].members[':mid'].merge.$post({ param: { id: h.id, mid: m.id }, json: { placeholderId: e.target.value } }))
                        }
                      >
                        <option value="">This person is really…</option>
                        {placeholders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <ErrorBox error={act.error} />
        {active && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              act.mutate(api.hisaabs[':id'].members.$post({ param: { id: h.id }, json: { name } }), { onSuccess: () => setName('') })
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a member by name" maxLength={60} aria-label="New member name" />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        )}
      </Card>

      {active && (
        <Card>
          <h2 className="mb-1 font-semibold">Invite link</h2>
          <p className="mb-2 text-sm text-slate-600">
            Send this to members so they can join and add their own bills.{h.joinApproval && ' The admin approves each person who joins.'}
          </p>
          {h.inviteLink ? (
            <>
              <p className="mb-2 break-all rounded-lg bg-slate-100 p-2 text-sm">{h.inviteLink}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(h.inviteLink!)}>
                  Copy
                </Button>
                <a
                  className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 font-semibold"
                  href={`https://wa.me/?text=${encodeURIComponent(`Join "${h.name}" on PaiseGuru: ${h.inviteLink}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Share on WhatsApp
                </a>
                <Button variant="ghost" onClick={() => confirm('The old link will stop working. Make a new one?') && invite.mutate()}>
                  Make a new link
                </Button>
              </div>
            </>
          ) : (
            <Button variant="secondary" onClick={() => invite.mutate()} disabled={invite.isPending}>
              Get invite link
            </Button>
          )}
          <ErrorBox error={invite.error} />
        </Card>
      )}

      {active && (
        <div className="pt-2 text-center">
          <Button variant="ghost" className="text-red-700" onClick={() => confirm(`Leave ${h.name}?`) && leave.mutate()}>
            Leave this Hisaab
          </Button>
          <ErrorBox error={leave.error} />
        </div>
      )}
    </Page>
  )
}
