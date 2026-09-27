import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="mx-auto min-h-dvh max-w-md bg-paper text-text">
      <Outlet />
    </div>
  ),
  notFoundComponent: () => <p className="p-6 pt-20 text-center text-muted">This page doesn't exist.</p>,
})
