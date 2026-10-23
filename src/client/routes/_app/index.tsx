import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Users } from 'lucide-react'
import { activityText, timeAgo } from '../../activity-text.ts'
import { ConfirmSlip, PaymentSlip } from '../../payment-slip.tsx'
import { InstallBanner } from '../../install.tsx'
import { homeQuery } from '../../queries.ts'
import { Avatar, ButtonLink, Card, Empty, ErrorBox, IconTile, Loading, Money, NetText, Page, Rows, Row, SectionTitle } from '../../ui.tsx'

export const Route = createFileRoute('/_app/')({ component: Home })

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Home() {
  const { user } = Route.useRouteContext()
  const { data, error, isPending } = useQuery(homeQuery())
  if (isPending) return <Loading />
  if (!data) return <Page title="PaiseGuru"><ErrorBox error={error} /></Page>
  const firstName = user.name.split(' ')[0]

  return (
    <Page title={firstName} subtitle={greeting()}>
      <InstallBanner />

      {data.groups.length > 0 && (
        <section className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-[13px] text-muted">You owe</p>
            <Money paise={data.owePaise} className="text-[26px] font-bold tracking-tight text-pays" />
          </Card>
          <Card>
            <p className="text-[13px] text-muted">You are owed</p>
            <Money paise={data.owedPaise} className="text-[26px] font-bold tracking-tight text-gets" />
          </Card>
        </section>
      )}

      {data.toConfirm.length > 0 && (
        <>
          <SectionTitle>Did you get these?</SectionTitle>
          {data.toConfirm.map((p) => (
            <ConfirmSlip key={p.id} p={p} subtitle={p.groupName} />
          ))}
        </>
      )}

      {data.toPay.length > 0 && (
        <>
          <SectionTitle>To pay</SectionTitle>
          {data.toPay.map((t) => (
            <PaymentSlip
              key={`${t.groupId}-${t.to}`}
              t={t}
              names={{ [t.from]: firstName ?? 'You', [t.to]: t.toName }}
              meMemberId={t.from}
              groupId={t.groupId}
              groupName={t.groupName}
              upiId={t.toUpiId}
              subtitle={t.groupName}
              canRecord
            />
          ))}
        </>
      )}

      {data.pending.map((g) => (
        <Card key={g.id}>
          <p className="font-semibold">{g.name}</p>
          <p className="mt-1 text-sm text-muted">Waiting for the admin to approve you.</p>
        </Card>
      ))}

      {data.groups.length > 0 && (
        <>
          <SectionTitle action={<Link to="/groups" className="text-sm font-semibold text-brand-text">All groups</Link>}>Your groups</SectionTitle>
          <Card flush>
            <Rows>
              {data.groups.map((g) => (
                <Row
                  key={g.id}
                  to="/groups/$id"
                  params={{ id: g.id }}
                  left={<IconTile icon={g.settleMode === 'monthly' ? CalendarDays : Users} tone={g.settleMode === 'monthly' ? 'brand' : 'marigold'} />}
                  title={g.name}
                  subtitle={<NetText paise={g.netPaise} />}
                  chevron
                />
              ))}
            </Rows>
          </Card>
        </>
      )}

      {data.groups.length === 0 && data.pending.length === 0 && (
        <Empty
          icon={Users}
          title="No groups yet"
          text="Make a group for your flat, a trip, friends or family. Split bills as you go, or once a month."
          action={<ButtonLink to="/groups/new">Create a group</ButtonLink>}
        />
      )}

      {data.news.length > 0 && (
        <>
          <SectionTitle>New since your last visit</SectionTitle>
          <Card flush>
            <Rows>
              {data.news.map((n) => (
                <Row
                  key={n.id}
                  to={n.sheetId ? '/sheets/$id' : '/groups/$id'}
                  params={{ id: n.sheetId ?? n.groupId }}
                  left={<Avatar name={n.actor ?? '?'} id={n.actor ?? n.groupId} />}
                  title={activityText(n)}
                  subtitle={`${n.groupName} · ${timeAgo(n.createdAt)}`}
                />
              ))}
            </Rows>
          </Card>
        </>
      )}
    </Page>
  )
}
