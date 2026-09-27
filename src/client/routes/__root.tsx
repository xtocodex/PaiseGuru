import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="mx-auto min-h-dvh max-w-md bg-slate-50 text-slate-900 shadow-sm">
      <Outlet />
    </div>
  ),
  notFoundComponent: () => <p className="p-6 text-center text-slate-600">Not found.</p>,
})
