import { queryOptions } from '@tanstack/react-query'
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
