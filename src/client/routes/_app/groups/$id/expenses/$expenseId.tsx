import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2 } from 'lucide-react'
import { api, call } from '../../../../../api.ts'
import { ExpenseForm, type ExpenseValues } from '../../../../../expense-form.tsx'
import { expensesQuery, groupQuery, sheetQuery } from '../../../../../queries.ts'
import { Button, ErrorBox, Loading, Page } from '../../../../../ui.tsx'

export const Route = createFileRoute('/_app/groups/$id/expenses/$expenseId')({
  validateSearch: (s: Record<string, unknown>) => ({ sheet: typeof s.sheet === 'string' ? s.sheet : undefined }),
  component: EditExpense,
})

function EditExpense() {
  const { id, expenseId } = Route.useParams()
  const { sheet: sheetId } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const g = useQuery(groupQuery(id))
  // Monthly expenses come from their month; as-you-go ones from the group list.
  const list = useQuery({ ...expensesQuery(id), enabled: !sheetId })
  const month = useQuery({ ...sheetQuery(sheetId ?? ''), enabled: !!sheetId })
  const e = (sheetId ? month.data?.entries : list.data?.expenses)?.find((x) => x.id === expenseId)
  const back = sheetId ? `/sheets/${sheetId}` : `/groups/${id}`
  const done = () => {
    queryClient.invalidateQueries()
    navigate({ to: back as '/', replace: true })
  }
  // A 409 means someone changed it meanwhile: reload so the next try uses fresh numbers.
  const onError = () => queryClient.invalidateQueries()
  const save = useMutation({ mutationFn: (v: ExpenseValues) => call(api.expenses[':id'].$patch({ param: { id: expenseId }, json: { ...v, version: e!.version } })), onSuccess: done, onError })
  const remove = useMutation({ mutationFn: () => call(api.expenses[':id'].$delete({ param: { id: expenseId }, json: { version: e!.version } })), onSuccess: done, onError })

  if (g.isPending || (sheetId ? month.isPending : list.isPending)) return <Loading />
  if (!g.data || g.data.pending || !e) return <Page title="Expense" close back={back}><ErrorBox error={g.error ?? new Error('This expense was deleted.')} /></Page>
  const closed = sheetId ? month.data?.sheet.state !== 'open' : false
  const editable = !closed && g.data.me.status === 'active'
  const members = g.data.members.filter((m) => m.status === 'active' || e.payers.some((p) => p.memberId === m.id) || e.shares.some((s) => s.memberId === m.id))

  return (
    <Page
      title={editable ? 'Edit expense' : 'Expense'}
      subtitle={g.data.name}
      close
      back={back}
      footer={
        editable && (
          <div className="flex gap-2">
            <Button variant="danger" icon={Trash2} aria-label="Delete expense" onClick={() => confirm('Delete this expense?') && remove.mutate()} disabled={remove.isPending}>
              Delete
            </Button>
            <Button type="submit" form="expense-form" className="flex-1" icon={Check} disabled={save.isPending}>
              Save changes
            </Button>
          </div>
        )
      }
    >
      {closed && <p className="rounded-xl bg-marigold-soft p-3 text-sm text-marigold-text">This month is closed, so its expenses can't change. The admin can reopen it.</p>}
      <fieldset disabled={!editable} className="contents">
        <ExpenseForm
          members={members.map((m) => ({ id: m.id, name: m.name, defaultWeight: m.defaultWeight }))}
          meId={g.data.me.memberId}
          funds={g.data.funds}
          monthly={g.data.settleMode === 'monthly'}
          initial={e}
          error={save.error ?? remove.error}
          onSubmit={(v) => save.mutate(v)}
        />
      </fieldset>
    </Page>
  )
}
