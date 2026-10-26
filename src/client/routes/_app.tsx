import { useEffect, useState } from 'react'
import { Link, Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, CircleUserRound, House, Plus, RotateCw, Users, type LucideIcon } from 'lucide-react'
import { authClient } from '../auth.ts'
import { cx, haptic } from '../ui.tsx'

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
const FLOW = /^\/(add|join\/|groups\/new|groups\/[^/]+\/(add|expenses\/)|sheets\/[^/]+\/close)/

function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <>
      <Outlet />
      {!FLOW.test(path) && (
        <>
          <PullToRefresh />
          <TabBar />
        </>
      )}
    </>
  )
}

/**
 * Pull down at the top of a tab to reload its data. The page itself never scrolls past the top
 * (overscroll-behavior: none in index.css), so this draws its own spinner.
 */
function PullToRefresh() {
  const queryClient = useQueryClient()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let startY: number | null = null
    let dist = 0
    const down = (e: TouchEvent) => {
      // Not while a sheet is open (it locks the page scroll).
      startY = window.scrollY <= 0 && document.body.style.overflow !== 'hidden' ? e.touches[0]!.clientY : null
      dist = 0
    }
    const move = (e: TouchEvent) => {
      if (startY === null) return
      dist = Math.max(0, e.touches[0]!.clientY - startY) * 0.5
      setPull(Math.min(dist, 88))
    }
    const up = async () => {
      if (startY === null) return
      startY = null
      if (dist >= 64) {
        setBusy(true)
        setPull(64)
        haptic()
        await queryClient.invalidateQueries()
        setBusy(false)
      }
      setPull(0)
    }
    addEventListener('touchstart', down, { passive: true })
    addEventListener('touchmove', move, { passive: true })
    addEventListener('touchend', up)
    addEventListener('touchcancel', up)
    return () => {
      removeEventListener('touchstart', down)
      removeEventListener('touchmove', move)
      removeEventListener('touchend', up)
      removeEventListener('touchcancel', up)
    }
  }, [queryClient])
  if (!pull && !busy) return null
  return (
    <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center" style={{ transform: `translateY(${pull - 44}px)`, transition: pull ? 'none' : 'transform 200ms' }}>
      <span role="status" aria-label={busy ? 'Refreshing' : 'Pull to refresh'} className="grid size-10 place-items-center rounded-full border border-line bg-card shadow-[0_6px_16px_-8px_rgb(16_19_28/0.35)]">
        <RotateCw className={cx('size-5 text-brand-text', busy && 'animate-spin')} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(pull / 64, 1) }} aria-hidden />
      </span>
    </div>
  )
}

function Tab({ to, icon: Icon, label, exact }: { to: string; icon: LucideIcon; label: string; exact?: boolean }) {
  return (
    <Link
      to={to as any}
      activeOptions={{ exact }}
      className="press flex min-h-12 flex-col items-center justify-start gap-0.5 pt-1 text-tab font-medium text-faint data-[status=active]:font-semibold data-[status=active]:text-brand-text"
    >
      <Icon className="size-6" aria-hidden />
      {label}
    </Link>
  )
}

function TabBar() {
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur-md select-none [view-transition-name:tabbar]">
      <div className="mx-auto grid max-w-md grid-cols-5 px-1.5 pt-1.5 pb-2">
        <Tab to="/" icon={House} label="Home" exact />
        <Tab to="/groups" icon={Users} label="Groups" />
        <Link to="/add" aria-label="Add an expense" className="press -mt-7 flex justify-center">
          <span className={cx('grid size-[58px] place-items-center rounded-[20px] border-4 border-paper bg-linear-to-br from-brand to-brand-2 text-on-brand shadow-[0_8px_16px_-6px_rgb(36_71_214/0.45)]')}>
            <Plus className="size-7" aria-hidden />
          </span>
        </Link>
        <Tab to="/activity" icon={Activity} label="Activity" />
        <Tab to="/me" icon={CircleUserRound} label="Me" />
      </div>
    </nav>
  )
}
