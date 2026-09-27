import { Link, Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { Activity, CircleUserRound, House, NotebookTabs, Plus, type LucideIcon } from 'lucide-react'
import { authClient } from '../auth.ts'
import { cx } from '../ui.tsx'

type SessionUser = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>['user']

export const Route = createFileRoute('/_app')({
  // Only a signed-in session is cached; a 401 from the API clears it (see main.tsx).
  beforeLoad: async ({ context, location }) => {
    const cached = context.queryClient.getQueryData<SessionUser>(['session'])
    const user = cached ?? (await authClient.getSession()).data?.user
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
    context.queryClient.setQueryData(['session'], user)
    return { user }
  },
  component: AppLayout,
})

// Full-screen flows (add, close, forms) hide the tab bar, like a native modal.
const FLOW = /^\/(add|join\/|hisaabs\/new|hisaabs\/[^/]+\/add|sheets\/[^/]+\/(close|entries\/))/

function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <>
      <Outlet />
      {!FLOW.test(path) && <TabBar />}
    </>
  )
}

function Tab({ to, icon: Icon, label, exact }: { to: string; icon: LucideIcon; label: string; exact?: boolean }) {
  return (
    <Link
      to={to as any}
      activeOptions={{ exact }}
      className="press flex min-h-12 flex-col items-center justify-start gap-0.5 pt-1 text-[11px] font-medium text-faint data-[status=active]:font-semibold data-[status=active]:text-brand-text"
    >
      <Icon className="size-6" aria-hidden />
      {label}
    </Link>
  )
}

function TabBar() {
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-md grid-cols-5 px-1.5 pt-1.5 pb-2">
        <Tab to="/" icon={House} label="Home" exact />
        <Tab to="/hisaabs" icon={NotebookTabs} label="Hisaabs" />
        <Link to="/add" aria-label="Add a bill" className="press -mt-7 flex justify-center">
          <span className={cx('grid size-[58px] place-items-center rounded-[20px] border-4 border-paper bg-marigold text-on-marigold shadow-[0_6px_14px_-6px_rgb(16_19_28/0.35)]')}>
            <Plus className="size-7" aria-hidden />
          </span>
        </Link>
        <Tab to="/activity" icon={Activity} label="Activity" />
        <Tab to="/me" icon={CircleUserRound} label="Me" />
      </div>
    </nav>
  )
}
