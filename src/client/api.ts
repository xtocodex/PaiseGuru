import { hc, type InferResponseType } from 'hono/client'
import type { AppType } from '../server/app.ts'

export const client = hc<AppType>('/')
export const api = client.api

/** An API error with the server's plain-English message. */
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Await a typed hc call; non-2xx → ApiError carrying the server message. */
export async function call<T extends Response>(p: Promise<T>) {
  const res = await p
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new ApiError(res.status, String(body.error ?? 'error'), String(body.message ?? 'Something went wrong.'))
  return body as T extends { json(): Promise<infer B> } ? B : never
}

export type SheetView = InferResponseType<(typeof api.sheets)[':id']['$get'], 200>
export type HisaabView = Extract<InferResponseType<(typeof api.hisaabs)[':id']['$get'], 200>, { pending: false }>
export type HomeView = InferResponseType<typeof api.home.$get, 200>
