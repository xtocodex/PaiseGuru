import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '../auth.ts'

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
