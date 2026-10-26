import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { api, call } from '../../../../api.ts'
import { ExpenseForm, type ExpenseValues } from '../../../../expense-form.tsx'
import { groupQuery } from '../../../../queries.ts'
import { Button, ErrorBox, Loading, Page } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/$id/add')({ component: AddExpense })

function AddExpense() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const g = useQuery(groupQuery(id))
  const [formKey, setFormKey] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)

  const save = useMutation({
    // The id is made here, so a double tap or a retry saves the expense once.
    mutationFn: (v: ExpenseValues) => call(api.groups[':id'].expenses.$post({ param: { id }, json: { id: crypto.randomUUID(), ...v } })),
  })

  if (g.isPending) return <Loading />
  if (!g.data || g.data.pending) return <Page title="Add" close back="/"><ErrorBox error={g.error} /></Page>
  const members = g.data.members.filter((m) => m.status === 'active').map((m) => ({ id: m.id, name: m.name, defaultWeight: m.defaultWeight }))

  return (
    <Page
      title={`Add to ${g.data.name}`}
      close
      back={`/groups/${id}`}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="expense-form" value="again" variant="secondary" disabled={save.isPending}>
            Save + next
          </Button>
          <Button type="submit" form="expense-form" className="flex-1" disabled={save.isPending} icon={Check}>
            Save
          </Button>
        </div>
      }
    >
      {saved && (
        <p role="status" className="rounded-xl bg-gets-soft p-3 text-body font-medium text-gets">
          {saved}
        </p>
      )}
      <ExpenseForm
        key={formKey}
        members={members}
        meId={g.data.me.memberId}
        funds={g.data.funds}
        monthly={g.data.settleMode === 'monthly'}
        error={save.error}
        onSubmit={(v, again) =>
          save.mutate(v, {
            onSuccess: (out) => {
              queryClient.invalidateQueries()
              if (again) {
                setSaved('Saved. Add the next one.')
                setFormKey((k) => k + 1)
              } else if (out.sheetId) navigate({ to: '/sheets/$id', params: { id: out.sheetId }, replace: true })
              else navigate({ to: '/groups/$id', params: { id }, replace: true })
            },
          })
        }
      />
    </Page>
  )
}
