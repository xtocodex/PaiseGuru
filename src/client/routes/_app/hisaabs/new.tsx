import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { CATEGORIES, addMonths, istDate, monthOf, sheetName, type Category } from '../../../../domain/hisaab.ts'
import { api, call } from '../../../api.ts'
import { Avatar, Button, Card, Chips, ErrorBox, Field, IconButton, Input, Page, Row, Rows, Select } from '../../../ui.tsx'

export const Route = createFileRoute('/_app/hisaabs/new')({ component: NewHisaab })

function NewHisaab() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const thisMonth = monthOf(istDate(new Date()))
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, -i))
  const [name, setName] = useState('')
  const [forLabel, setForLabel] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [startMonth, setStartMonth] = useState(thisMonth)
  const [earlier, setEarlier] = useState(false)
  const [category, setCategory] = useState<Category>('Shared')

  const create = useMutation({
    mutationFn: () => call(api.hisaabs.$post({ json: { name, forLabel, category, startMonth, members } })),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries()
      navigate({ to: '/hisaabs/$id', params: { id }, replace: true })
    },
  })

  function addMember() {
    const n = newName.trim()
    if (n && !members.includes(n)) setMembers([...members, n])
    setNewName('')
  }

  return (
    <Page
      title="New Hisaab"
      close
      back="/hisaabs"
      footer={
        <Button type="submit" form="new-hisaab" className="w-full" disabled={create.isPending}>
          Create Hisaab
        </Button>
      }
    >
      <form id="new-hisaab" className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
        <Field label="Name" hint="For example: Dadi's care, Flat 402, Hostel mess">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
        </Field>
        <Field label="Who is it for? (optional)" hint="Their pension and bills paid from their money are tracked, never divided.">
          <Input value={forLabel} onChange={(e) => setForLabel(e.target.value)} maxLength={60} placeholder="For example: Dadi" />
        </Field>

        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-muted">Members who share the cost</p>
          <Card flush>
            <Rows>
              <Row left={<Avatar name={user.name} id={user.id} />} title={`${user.name} (you)`} subtitle="Admin" />
              {members.map((m) => (
                <Row key={m} left={<Avatar name={m} id={m} muted />} title={m} subtitle="Can join later with a link" right={<IconButton icon={X} label={`Remove ${m}`} onClick={() => setMembers(members.filter((x) => x !== m))} />} />
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
          <p className="text-[13px] text-muted">They don't need the app. You can add their bills for them.</p>
        </div>

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

        <Field label="Counts in each member's spending as">
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
