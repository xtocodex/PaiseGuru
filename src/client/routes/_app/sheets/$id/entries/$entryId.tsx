import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, call } from '../../../../../api.ts'
import { EntryForm, type EntryValues } from '../../../../../entry-form.tsx'
import { sheetQuery } from '../../../../../queries.ts'
import { Button, ErrorBox, Loading, Page } from '../../../../../ui.tsx'

export const Route = createFileRoute('/_app/sheets/$id/entries/$entryId')({ component: EditEntry })

function EditEntry() {
  const { id, entryId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const s = useQuery(sheetQuery(id))
  const done = () => {
    queryClient.invalidateQueries()
    navigate({ to: '/sheets/$id', params: { id } })
  }
  const version = s.data?.sheet.version ?? 0
  const save = useMutation({ mutationFn: (v: EntryValues) => call(api.entries[':id'].$patch({ param: { id: entryId }, json: { ...v, version } })), onSuccess: done })
  const remove = useMutation({ mutationFn: () => call(api.entries[':id'].$delete({ param: { id: entryId }, json: { version } })), onSuccess: done })
  // A 409 means someone changed the month meanwhile: reload it so the next try uses fresh numbers.
  const onError = () => queryClient.invalidateQueries({ queryKey: ['sheet', id] })

  if (s.isPending) return <Loading />
  const e = s.data?.entries.find((x) => x.id === entryId)
  if (!s.data || !e) return <Page title="Entry" back><ErrorBox error={s.error ?? new Error('This entry was deleted.')} /></Page>
  const editable = s.data.sheet.state === 'open' && s.data.me.status === 'active'
  const members = s.data.participants.map((p) => ({ id: p.memberId, name: p.name }))

  return (
    <Page title="Edit entry" back>
      {!editable && <p className="rounded-xl bg-amber-50 p-3 text-sm">This month is closed, so entries can't change. The admin can reopen it.</p>}
      <fieldset disabled={!editable} className="space-y-4">
        <EntryForm
          members={members}
          forLabel={s.data.hisaab.forLabel}
          meId={s.data.me.memberId}
          initial={{ ...e, category: e.category as EntryValues['category'] }}
          submitLabel="Save changes"
          pending={save.isPending}
          error={save.error ?? remove.error}
          onSubmit={(v) => save.mutate(v, { onError })}
        />
        <Button variant="danger" className="w-full" onClick={() => confirm('Delete this entry?') && remove.mutate(undefined, { onError })}>
          Delete entry
        </Button>
      </fieldset>
    </Page>
  )
}
