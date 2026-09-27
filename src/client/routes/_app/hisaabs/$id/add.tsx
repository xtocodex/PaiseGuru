import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, call } from '../../../../api.ts'
import { EntryForm, type EntryValues } from '../../../../entry-form.tsx'
import { hisaabQuery } from '../../../../queries.ts'
import { ErrorBox, Loading, Page } from '../../../../ui.tsx'

export const Route = createFileRoute('/_app/hisaabs/$id/add')({ component: AddEntry })

function AddEntry() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const h = useQuery(hisaabQuery(id))
  const [formKey, setFormKey] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)

  const save = useMutation({
    // The id is made here, so a double tap or a retry saves the entry once.
    mutationFn: (v: EntryValues) => call(api.hisaabs[':id'].entries.$post({ param: { id }, json: { id: crypto.randomUUID(), ...v } })),
  })

  if (h.isPending) return <Loading />
  if (!h.data || h.data.pending) return <ErrorBox error={h.error} />
  const members = h.data.members.filter((m) => m.status === 'active').map((m) => ({ id: m.id, name: m.name }))

  return (
    <Page title={`Add to ${h.data.name}`} back>
      {saved && <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand-dark">{saved}</p>}
      <EntryForm
        key={formKey}
        members={members}
        forLabel={h.data.forLabel}
        meId={h.data.me.memberId}
        submitLabel="Save"
        pending={save.isPending}
        error={save.error}
        onSubmit={(v, again) =>
          save.mutate(v, {
            onSuccess: (out) => {
              queryClient.invalidateQueries({ queryKey: ['sheet', out.sheetId] })
              queryClient.invalidateQueries({ queryKey: ['hisaab', id] })
              queryClient.invalidateQueries({ queryKey: ['home'] })
              if (again) {
                setSaved('Saved. Add the next one.')
                setFormKey((k) => k + 1)
              } else navigate({ to: '/sheets/$id', params: { id: out.sheetId } })
            },
          })
        }
      />
    </Page>
  )
}
