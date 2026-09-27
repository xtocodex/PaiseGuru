import { queryOptions } from '@tanstack/react-query'
import { api, call } from './api.ts'

export const homeQuery = () => queryOptions({ queryKey: ['home'], queryFn: () => call(api.home.$get()) })
export const hisaabsQuery = () => queryOptions({ queryKey: ['hisaabs'], queryFn: () => call(api.hisaabs.$get()) })
export const hisaabQuery = (id: string) => queryOptions({ queryKey: ['hisaab', id], queryFn: () => call(api.hisaabs[':id'].$get({ param: { id } })) })
export const sheetQuery = (id: string) => queryOptions({ queryKey: ['sheet', id], queryFn: () => call(api.sheets[':id'].$get({ param: { id } })) })
export const activityQuery = () => queryOptions({ queryKey: ['activity'], queryFn: () => call(api.activity.$get()) })
export const meQuery = () => queryOptions({ queryKey: ['me'], queryFn: () => call(api.me.$get()) })
export const configQuery = () => queryOptions({ queryKey: ['config'], queryFn: () => call(api.config.$get()), staleTime: Infinity })
