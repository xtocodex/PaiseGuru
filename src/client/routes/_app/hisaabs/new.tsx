import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CATEGORIES, addMonths, istDate, monthOf, sheetName } from '../../../../domain/hisaab.ts'
import { api, call } from '../../../api.ts'
import { Button, Card, ErrorBox, Field, Input, Page, Select } from '../../../ui.tsx'

export const Route = createFileRoute('/_app/hisaabs/new')({ component: NewHisaab })

function NewHisaab() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const thisMonth = monthOf(istDate(new Date()))
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, -i))
  const [members, setMembers] = useState<string[]>([])
  const [newName, setNewName] = useState('')

  const create = useMutation({
    mutationFn: (form: FormData) =>
      call(
        api.hisaabs.$post({
          json: {
            name: String(form.get('name')),
            forLabel: String(form.get('forLabel') ?? ''),
            category: String(form.get('category')) as (typeof CATEGORIES)[number],
            startMonth: String(form.get('startMonth')),
            members,
          },
        }),
      ),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ['home'] })
      navigate({ to: '/hisaabs/$id', params: { id } })
    },
  })

  function addMember() {
    const name = newName.trim()
    if (name && !members.includes(name)) setMembers([...members, name])
    setNewName('')
  }

  return (
    <Page title="New Hisaab" back>
      <p className="text-sm text-slate-600">Add bills all month, then divide them once at month-end.</p>
      <form action={(f) => create.mutate(f)} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Name" hint="For example: Flat 402 monthly, Hostel mess, Office tea fund">
            <Input name="name" required maxLength={80} />
          </Field>
          <Field label="For (optional)" hint="The person the costs are for, if any. They don't pay and don't need the app.">
            <Input name="forLabel" maxLength={60} />
          </Field>
          <Field label="Counts in my spending as">
            <Select name="category" defaultValue="Shared">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="First month" hint="Pick an earlier month to enter old months from a notebook.">
            <Select name="startMonth" defaultValue={thisMonth}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {sheetName(m)}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Members who share the cost</h2>
          <ul className="mb-3 divide-y divide-slate-100">
            <li className="flex min-h-11 items-center">{user.name} (you)</li>
            {members.map((m) => (
              <li key={m} className="flex min-h-11 items-center justify-between">
                <span>
                  {m} <span className="text-xs text-slate-500">can join later</span>
                </span>
                <button type="button" aria-label={`Remove ${m}`} className="size-11 text-slate-400" onClick={() => setMembers(members.filter((x) => x !== m))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addMember()
                }
              }}
              placeholder="Name"
              maxLength={60}
              aria-label="New member name"
            />
            <Button type="button" variant="secondary" onClick={addMember}>
              Add
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">They don't need the app. You can add their bills for them.</p>
        </Card>

        <ErrorBox error={create.error} />
        <Button type="submit" className="w-full" disabled={create.isPending}>
          Create Hisaab
        </Button>
        <p className="text-center text-xs text-slate-500">A new month opens by itself on the 1st.</p>
      </form>
    </Page>
  )
}
