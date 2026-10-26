import { queryOptions, type EnsureQueryDataOptions, type QueryClient } from '@tanstack/react-query'
import { api, call } from './api.ts'

export const homeQuery = () => queryOptions({ queryKey: ['home'], queryFn: () => call(api.home.$get()) })
export const groupsQuery = () => queryOptions({ queryKey: ['groups'], queryFn: () => call(api.groups.$get()) })
export const groupQuery = (id: string) => queryOptions({ queryKey: ['group', id], queryFn: () => call(api.groups[':id'].$get({ param: { id } })) })
export const expensesQuery = (id: string) => queryOptions({ queryKey: ['group', id, 'expenses'], queryFn: () => call(api.groups[':id'].expenses.$get({ param: { id } })) })
export const paymentsQuery = (id: string) => queryOptions({ queryKey: ['group', id, 'payments'], queryFn: () => call(api.groups[':id'].payments.$get({ param: { id } })) })
export const sheetQuery = (id: string) => queryOptions({ queryKey: ['sheet', id], queryFn: () => call(api.sheets[':id'].$get({ param: { id } })) })
export const activityQuery = () => queryOptions({ queryKey: ['activity'], queryFn: () => call(api.activity.$get()) })
export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => call(api.me.$get()) })
export const configQuery = () => queryOptions({ queryKey: ['config'], queryFn: () => call(api.config.$get()), staleTime: Infinity })

/**
 * Route loader: fetch a page's data before navigating, so the page transition lands on the real screen
 * instead of a skeleton. Cached data is instant; a slow fetch holds the tap at most 300 ms, then the page
 * opens on its skeleton and fills in. Errors are left to the page (its useQuery shows them).
 */
export const preload = (queryClient: QueryClient, ...queries: EnsureQueryDataOptions<any, Error, any, any>[]) =>
  Promise.race([
    Promise.all(queries.map((q) => queryClient.ensureQueryData(q).catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 300)),
  ])
