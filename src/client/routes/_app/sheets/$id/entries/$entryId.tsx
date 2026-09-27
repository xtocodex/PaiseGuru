import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2 } from 'lucide-react'
import type { Category } from '../../../../../../domain/hisaab.ts'
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
    navigate({ to: '/sheets/$id', params: { id }, replace: true })
  }
  const version = s.data?.sheet.version ?? 0
  // A 409 means someone changed the month meanwhile: reload it so the next try uses fresh numbers.
  const onError = () => queryClient.invalidateQueries({ queryKey: ['sheet', id] })
  const save = useMutation({ mutationFn: (v: EntryValues) => call(api.entries[':id'].$patch({ param: { id: entryId }, json: { ...v, version } })), onSuccess: done, onError })
  const remove = useMutation({ mutationFn: () => call(api.entries[':id'].$delete({ param: { id: entryId }, json: { version } })), onSuccess: done, onError })

  if (s.isPending) return <Loading />
  const e = s.data?.entries.find((x) => x.id === entryId)
  if (!s.data || !e) return <Page title="Entry" close back={`/sheets/${id}`}><ErrorBox error={s.error ?? new Error('This entry was deleted.')} /></Page>
  const editable = s.data.sheet.state === 'open' && s.data.me.status === 'active'

  return (
    <Page
      title={editable ? 'Edit entry' : 'Entry'}
      subtitle={`${s.data.hisaab.name} · ${s.data.sheet.name.split(' ')[0]}`}
      close
      back={`/sheets/${id}`}
      footer={
        editable && (
          <div className="flex gap-2">
            <Button variant="danger" icon={Trash2} aria-label="Delete entry" onClick={() => confirm('Delete this entry?') && remove.mutate()} disabled={remove.isPending}>
              Delete
            </Button>
            <Button type="submit" form="entry-form" className="flex-1" icon={Check} disabled={save.isPending}>
              Save changes
            </Button>
          </div>
        )
      }
    >
      {!editable && <p className="rounded-xl bg-marigold-soft p-3 text-sm text-marigold-text">This month is closed, so entries can't change. The admin can reopen it.</p>}
      <fieldset disabled={!editable} className="contents">
        <EntryForm
          members={s.data.participants.map((p) => ({ id: p.memberId, name: p.name }))}
          meId={s.data.me.memberId}
          forLabel={s.data.hisaab.forLabel}
          initial={{ ...e, category: e.category as Category | null }}
          error={save.error ?? remove.error}
          onSubmit={(v) => save.mutate(v)}
        />
      </fieldset>
    </Page>
  )
}
