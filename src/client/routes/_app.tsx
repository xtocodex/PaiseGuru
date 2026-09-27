import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '../auth.ts'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession()
    if (!data) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user: data.user }
  },
  component: AppLayout,
})

const tab = 'flex min-h-14 flex-1 items-center justify-center text-sm font-medium text-slate-500'

function AppLayout() {
  return (
    <>
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-slate-200 bg-white">
        <Link to="/" className={tab} activeProps={{ className: 'text-brand' }} activeOptions={{ exact: true }}>
          Home
        </Link>
        <Link to="/me" className={tab} activeProps={{ className: 'text-brand' }}>
          Me
        </Link>
      </nav>
    </>
  )
}
