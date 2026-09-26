import { describe, expect, it } from 'vitest'
import { devLoginEnabled } from './auth.ts'

describe('dev email login switch', () => {
  it('is on only in test or development', () => {
    expect(devLoginEnabled({ DEV_LOGIN: '1', NODE_ENV: 'test' })).toBe(true)
    expect(devLoginEnabled({ DEV_LOGIN: '1', NODE_ENV: 'development' })).toBe(true)
    expect(devLoginEnabled({ NODE_ENV: 'development' })).toBe(false)
  })

  it('refuses to boot in production (or with NODE_ENV unset) when switched on', () => {
    expect(() => devLoginEnabled({ DEV_LOGIN: '1', NODE_ENV: 'production' })).toThrow()
    expect(() => devLoginEnabled({ DEV_LOGIN: '1' })).toThrow()
  })
})
