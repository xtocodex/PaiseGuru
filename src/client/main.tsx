import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from './api.ts'
import { routeTree } from './routeTree.gen.ts'
import './index.css'
import { registerServiceWorker } from './pwa.ts'
import { Loading } from './ui.tsx'

// Signed out mid-session (expired cookie): drop cached data and go to sign-in.
const onError = (error: Error) => {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.clear()
    router.navigate({ to: '/login', search: { redirect: location.pathname } })
  }
}
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { staleTime: 10_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
})
// Page motion like a native app: deeper pages slide in from the right, going back slides out, and
// switching tabs cross-fades (styles in index.css).
const TABS = new Set(['/', '/groups', '/activity', '/me'])
const depth = (path: string) => path.split('/').filter(Boolean).length
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPendingComponent: Loading, // only after a second of loading (loaders fetch before the transition)
  defaultViewTransition: {
    types: ({ fromLocation, toLocation, pathChanged }) => {
      if (!pathChanged) return false
      const from = fromLocation?.pathname ?? '/'
      const to = toLocation.pathname
      if ((TABS.has(from) && TABS.has(to)) || from === '/login' || to === '/login') return ['tab']
      return [depth(to) < depth(from) ? 'back' : 'forward']
    },
  },
  scrollRestoration: true,
})
registerServiceWorker()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
