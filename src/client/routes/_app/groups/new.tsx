import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, Users, X } from 'lucide-react'
import { CATEGORIES, addMonths, istDate, monthOf, sheetName, type Category, type SettleMode } from '../../../../domain/group.ts'
import { api, call } from '../../../api.ts'
import { Avatar, Button, Card, Chips, ErrorBox, Field, IconButton, IconTile, Input, Page, Row, Rows, Select, cx } from '../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/new')({ component: NewGroup })

const MODES: { value: SettleMode; title: string; text: string; icon: typeof Users }[] = [
  { value: 'as_you_go', title: 'Split as you go', text: 'Each expense is split when you add it. Settle up any time. For trips, flatmates, friends.', icon: Users },
  { value: 'monthly', title: 'Once a month', text: 'Bills pile up all month, then you divide them at month end, with fixed amounts or skips. For a home or a parent.', icon: CalendarDays },
]

function NewGroup() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const thisMonth = monthOf(istDate(new Date()))
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, -i))
  const [name, setName] = useState('')
  const [settleMode, setSettleMode] = useState<SettleMode>('as_you_go')
  const [members, setMembers] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [startMonth, setStartMonth] = useState(thisMonth)
  const [earlier, setEarlier] = useState(false)
  const [category, setCategory] = useState<Category>('Shared')

  const create = useMutation({
    mutationFn: () => call(api.groups.$post({ json: { name, settleMode, category, startMonth: settleMode === 'monthly' ? startMonth : undefined, members } })),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries()
      navigate({ to: '/groups/$id', params: { id }, replace: true })
    },
  })

  function addMember() {
    const n = newName.trim()
    if (n && !members.includes(n)) setMembers([...members, n])
    setNewName('')
  }

  return (
    <Page
      title="New group"
      close
      back="/groups"
      footer={
        <Button type="submit" form="new-group" className="w-full" disabled={create.isPending}>
          Create group
        </Button>
      }
    >
      <form id="new-group" className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
        <Field label="Name" hint="For example: Goa trip, Flat 402, Mom's care">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
        </Field>

        <div role="radiogroup" aria-label="How do you settle?" className="flex flex-col gap-2">
          <p className="text-caption font-semibold text-muted">How do you settle?</p>
          {MODES.map((m) => {
            const on = settleMode === m.value
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSettleMode(m.value)}
                className={cx('press flex items-start gap-3 rounded-2xl border-2 bg-card p-3.5 text-left', on ? 'border-brand' : 'border-line')}
              >
                <IconTile icon={m.icon} tone={m.value === 'monthly' ? 'brand' : 'sky'} />
                <span>
                  <span className="block font-semibold">{m.title}</span>
                  <span className="block text-caption leading-snug text-muted">{m.text}</span>
                </span>
              </button>
            )
          })}
          <p className="text-caption text-muted">You can change this later in the group settings.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-caption font-semibold text-muted">Members</p>
          <Card flush>
            <Rows>
              <Row left={<Avatar name={user.name} me />} title={`${user.name} (you)`} subtitle="Admin" />
              {members.map((m) => (
                <Row key={m} left={<Avatar name={m} muted />} title={m} subtitle="Can join later with a link" right={<IconButton icon={X} label={`Remove ${m}`} onClick={() => setMembers(members.filter((x) => x !== m))} />} />
              ))}
              <div className="flex items-center gap-2 py-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
                  placeholder="Member's name"
                  aria-label="New member name"
                  maxLength={60}
                />
                <Button variant="secondary" icon={Plus} onClick={addMember}>
                  Add
                </Button>
              </div>
            </Rows>
          </Card>
          <p className="text-caption text-muted">They don't need the app. You can add expenses for them, and invite them later.</p>
        </div>

        {settleMode === 'monthly' && (
          <Field label="First month" group hint="Pick an earlier month to enter old months from a notebook.">
            <Chips
              label="First month"
              value={earlier ? 'earlier' : startMonth}
              onChange={(v) => (v === 'earlier' ? setEarlier(true) : (setEarlier(false), setStartMonth(v)))}
              options={[...months.slice(0, 3).map((m) => ({ value: m, label: sheetName(m).split(' ')[0]! })), { value: 'earlier', label: 'Earlier…' }]}
            />
            {earlier && (
              <Select aria-label="Earlier month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {sheetName(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Category" hint="Used for this group's totals.">
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <ErrorBox error={create.error} />
      </form>
    </Page>
  )
}
