import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IndianRupee, KeyRound, LogOut, Moon, Pencil, Smartphone } from 'lucide-react'
import { UPI_ID } from '../../../shared/schemas.ts'
import { api, call } from '../../api.ts'
import { authClient } from '../../auth.ts'
import { InstallHelp } from '../../install.tsx'
import { getTheme, setTheme, useInstall, type Theme } from '../../pwa.ts'
import { meQuery } from '../../queries.ts'
import { Avatar, Button, Card, ErrorBox, FOUNDER_URL, Field, IconButton, IconTile, Input, Loading, Page, Row, Rows, Segmented, Sheet } from '../../ui.tsx'

export const Route = createFileRoute('/_app/me')({ component: Me })

type Panel = 'name' | 'upi' | 'password' | 'appearance' | 'install' | 'delete' | null

function Me() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const me = useQuery(meQuery())
  const install = useInstall()
  const [panel, setPanel] = useState<Panel>(null)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const close = () => setPanel(null)

  const signOut = async () => {
    await authClient.signOut()
    queryClient.clear()
    navigate({ to: '/login' })
  }

  if (me.isPending) return <Loading />
  if (!me.data) return <Page title="Me"><ErrorBox error={me.error} /></Page>
  const u = me.data

  return (
    <Page title="Me">
      <Card>
        <div className="flex items-center gap-3.5">
          <Avatar name={u.name} id={u.id} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{u.name}</p>
            <p className="truncate text-[13px] text-muted">{u.username ? `User ID: ${u.username}` : u.email}</p>
          </div>
          <IconButton icon={Pencil} label="Edit name" onClick={() => setPanel('name')} />
        </div>
      </Card>

      <Card flush>
        <Rows>
          <Row onClick={() => setPanel('upi')} left={<IconTile icon={IndianRupee} />} title="UPI ID" subtitle={u.upiId ? `${u.upiId} · so family can pay you` : 'Add one so family can pay you'} chevron />
          {u.username && <Row onClick={() => setPanel('password')} left={<IconTile icon={KeyRound} />} title="Change password" chevron />}
          {!install.installed && (
            <Row
              onClick={() => (install.canPrompt ? install.install() : setPanel('install'))}
              left={<IconTile icon={Smartphone} />}
              title="Install app"
              subtitle="Add to home screen"
              chevron
            />
          )}
          <Row onClick={() => setPanel('appearance')} left={<IconTile icon={Moon} />} title="Appearance" subtitle={{ system: 'Follows your phone', light: 'Light', dark: 'Dark' }[theme]} chevron />
        </Rows>
      </Card>

      <Button variant="danger" icon={LogOut} onClick={signOut}>
        Sign out
      </Button>

      <Card className="text-center">
        <p className="text-xl font-bold tracking-tight text-brand-text">PaiseGuru</p>
        <p className="text-[13px] text-muted">A product of xtocodex</p>
        <p className="mt-2 text-sm">
          Founder{' '}
          <a href={FOUNDER_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-text underline-offset-2 hover:underline">
            Gopal Mohapatra
          </a>{' '}
          · gopalmohapatra.in
        </p>
      </Card>

      <button type="button" className="mx-auto min-h-11 px-4 text-[13px] text-muted underline-offset-2 hover:underline" onClick={() => setPanel('delete')}>
        Delete my account
      </button>

      {panel === 'name' && <NameSheet name={u.name} onClose={close} />}
      {panel === 'upi' && <UpiSheet upiId={u.upiId} onClose={close} />}
      {panel === 'password' && <PasswordSheet onClose={close} />}
      <InstallHelp open={panel === 'install'} onClose={close} />
      <Sheet open={panel === 'appearance'} onClose={close} title="Appearance">
        <Segmented
          label="Appearance"
          value={theme}
          onChange={(t) => {
            setTheme(t)
            setThemeState(t)
          }}
          options={[
            { value: 'system', label: 'Phone' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Button onClick={close}>Done</Button>
      </Sheet>
      {panel === 'delete' && <DeleteSheet onClose={close} onDeleted={signOut} />}
    </Page>
  )
}

function useSaveMe(onDone: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { name?: string; upiId?: string }) => call(api.me.$patch({ json: v })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onDone()
    },
  })
}

function NameSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const [value, setValue] = useState(name)
  const save = useSaveMe(onClose)
  return (
    <Sheet open onClose={onClose} title="Your name">
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate({ name: value }))}>
        <Field label="Name">
          <Input value={value} onChange={(e) => setValue(e.target.value)} required maxLength={60} autoComplete="name" />
        </Field>
        <ErrorBox error={save.error} />
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </form>
    </Sheet>
  )
}

function UpiSheet({ upiId, onClose }: { upiId: string | null; onClose: () => void }) {
  const [value, setValue] = useState(upiId ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveMe(onClose)
  return (
    <Sheet open onClose={onClose} title="UPI ID">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const v = value.trim()
          if (v && !UPI_ID.test(v)) return setError('This does not look like a UPI ID (like name@bank).')
          setError(null)
          save.mutate({ upiId: v })
        }}
      >
        <Field label="UPI ID" hint="Only members of your Hisaabs see it, on the Pay button." error={error}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="name@bank" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" />
        </Field>
        <ErrorBox error={save.error} />
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </form>
    </Sheet>
  )
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const change = useMutation({
    mutationFn: async () => {
      const res = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
      if (res.error) throw new Error(res.error.status === 400 || res.error.status === 401 ? 'Your current password is not right.' : (res.error.message ?? 'That did not work.'))
    },
    onSuccess: () => setDone(true),
  })
  return (
    <Sheet open onClose={onClose} title="Change password">
      {done ? (
        <>
          <p className="rounded-xl bg-gets-soft p-3 text-sm text-gets">Password changed. Other phones signed in to this account are signed out.</p>
          <Button onClick={onClose}>Done</Button>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (next.length < 8) return setError('Use at least 8 characters.')
            setError(null)
            change.mutate()
          }}
        >
          <Field label="Current password">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 8 characters. Something only you would know." error={error}>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          <ErrorBox error={change.error} />
          <Button type="submit" disabled={change.isPending}>
            Change password
          </Button>
        </form>
      )}
    </Sheet>
  )
}

function DeleteSheet({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const remove = useMutation({ mutationFn: () => call(api.me.$delete()), onSuccess: onDeleted })
  return (
    <Sheet open onClose={onClose} title="Delete my account">
      <p className="text-sm text-muted">
        Your name, sign-in and UPI ID are deleted. Amounts you added stay in shared Hisaabs under "Deleted user", so nobody else's numbers change. This can't be undone.
      </p>
      <Field label='Type "DELETE" to confirm'>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
      </Field>
      <ErrorBox error={remove.error} />
      <Button variant="danger" disabled={typed !== 'DELETE' || remove.isPending} onClick={() => remove.mutate()}>
        Delete my account
      </Button>
    </Sheet>
  )
}
