import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { api, call } from '../../../../api.ts'
import { EntryForm, type EntryValues } from '../../../../entry-form.tsx'
import { hisaabQuery } from '../../../../queries.ts'
import { Button, ErrorBox, Loading, Page } from '../../../../ui.tsx'

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
  if (!h.data || h.data.pending) return <Page title="Add" close back="/"><ErrorBox error={h.error} /></Page>
  const members = h.data.members.filter((m) => m.status === 'active').map((m) => ({ id: m.id, name: m.name }))

  return (
    <Page
      title={`Add to ${h.data.name}`}
      close
      back={`/hisaabs/${id}`}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="entry-form" value="again" variant="secondary" disabled={save.isPending}>
            Save + next
          </Button>
          <Button type="submit" form="entry-form" className="flex-1" disabled={save.isPending} icon={Check}>
            Save
          </Button>
        </div>
      }
    >
      {saved && (
        <p role="status" className="rounded-xl bg-gets-soft p-3 text-sm font-medium text-gets">
          {saved}
        </p>
      )}
      <EntryForm
        key={formKey}
        members={members}
        meId={h.data.me.memberId}
        forLabel={h.data.forLabel}
        error={save.error}
        onSubmit={(v, again) =>
          save.mutate(v, {
            onSuccess: (out) => {
              queryClient.invalidateQueries()
              if (again) {
                setSaved('Saved. Add the next one.')
                setFormKey((k) => k + 1)
              } else navigate({ to: '/sheets/$id', params: { id: out.sheetId }, replace: true })
            },
          })
        }
      />
    </Page>
  )
}
