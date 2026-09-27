import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { NotebookPen } from 'lucide-react'
import { activityText, timeAgo } from '../../activity-text.ts'
import type { HomeView } from '../../api.ts'
import { PaymentSlip } from '../../payment-slip.tsx'
import { InstallBanner } from '../../install.tsx'
import { homeQuery } from '../../queries.ts'
import { Avatar, ButtonLink, Card, Empty, ErrorBox, Loading, Money, Page, Rows, Row, SectionTitle, StateTag } from '../../ui.tsx'

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
  const lines = data.hisaabs.flatMap((h) => h.lines.map((l) => ({ ...l, hisaabId: h.id, hisaabName: h.name })))
  // Open months with no entries add noise; keep only each Hisaab's latest open month in that case.
  const latestOpen = new Set(data.hisaabs.map((h) => h.lines.filter((l) => l.estimate).at(-1)?.sheetId))
  const open = lines.filter((l) => l.estimate && (l.entryCount || latestOpen.has(l.sheetId)))

  return (
    <Page title={firstName} subtitle={greeting()}>
      <InstallBanner />

      {data.payments.length > 0 && (
        <>
          <SectionTitle>To settle</SectionTitle>
          {data.payments.map((p) => (
            <PaymentSlip
              key={p.id}
              t={{ id: p.id, from: p.from, to: p.to, amountPaise: p.amountPaise, status: 'unpaid' }}
              names={{ [p.from]: p.fromName, [p.to]: p.toName }}
              meMemberId={p.iPay ? p.from : p.iGet ? p.to : ''}
              subtitle={`${p.hisaabName} · ${p.sheetName.split(' ')[0]}`}
              upiId={p.toUpiId}
              hisaabName={p.hisaabName}
              version={p.version}
              canMark
            />
          ))}
        </>
      )}

      {data.pending.map((h) => (
        <Card key={h.id}>
          <p className="font-semibold">{h.name}</p>
          <p className="mt-1 text-sm text-muted">Waiting for the admin to approve you.</p>
        </Card>
      ))}

      {open.map((l) => (
        <Link key={l.sheetId} to="/sheets/$id" params={{ id: l.sheetId }} className="press block">
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold">{l.sheetName.split(' ')[0]} so far</p>
              <StateTag state="open" />
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {l.hisaabName} · {l.entryCount} {l.entryCount === 1 ? 'entry' : 'entries'}
            </p>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-[13px] text-muted">Your share if closed today</p>
                {l.myPaise === null ? <p className="text-muted">–</p> : <Money paise={l.myPaise} className="text-[28px] font-bold tracking-tight" />}
              </div>
              <div className="text-right">
                <p className="text-[13px] text-muted">You paid</p>
                <Money paise={l.myPaidPaise} className="text-xl font-bold text-gets" />
              </div>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              <Money paise={l.totalPaise} /> spent in total · close whenever you're ready
            </p>
          </Card>
        </Link>
      ))}

      {data.hisaabs.length > 0 && (
        <Card>
          <p className="text-[13px] text-muted">{data.monthName} · your spending</p>
          <Money paise={data.spendPaise} className="text-[28px] font-bold tracking-tight" />
          <p className="mt-1 text-[13px] text-muted">Your share of months that are closed.</p>
        </Card>
      )}

      {data.hisaabs.length === 0 && data.pending.length === 0 && (
        <Empty
          icon={NotebookPen}
          title="No Hisaab yet"
          text="A Hisaab collects shared bills all month, then divides them once."
          action={<ButtonLink to="/hisaabs/new">Create a Hisaab</ButtonLink>}
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
                  to={n.sheetId ? '/sheets/$id' : '/hisaabs/$id'}
                  params={{ id: n.sheetId ?? n.hisaabId }}
                  left={<Avatar name={n.actor ?? '?'} id={n.actor ?? n.hisaabId} />}
                  title={activityText(n)}
                  subtitle={`${n.hisaabName} · ${timeAgo(n.createdAt)}`}
                />
              ))}
            </Rows>
          </Card>
        </>
      )}
    </Page>
  )
}
