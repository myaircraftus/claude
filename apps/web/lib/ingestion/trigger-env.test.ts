import { describe, expect, it } from 'vitest'
import {
  ensureTriggerSecretKey,
  getTriggerAuthToken,
  isTriggerConfigured,
} from '@/lib/ingestion/trigger-env'

describe('trigger env helpers', () => {
  it('prefers TRIGGER_SECRET_KEY when both env vars exist', () => {
    const env = {
      TRIGGER_SECRET_KEY: 'secret-token',
      TRIGGER_API_KEY: 'api-token',
    } as unknown as NodeJS.ProcessEnv

    expect(getTriggerAuthToken(env)).toBe('secret-token')
  })

  it('falls back to TRIGGER_API_KEY when secret key is absent', () => {
    const env = {
      TRIGGER_API_KEY: 'api-token',
    } as unknown as NodeJS.ProcessEnv

    expect(getTriggerAuthToken(env)).toBe('api-token')
    expect(isTriggerConfigured(env)).toBe(true)
  })

  it('hydrates TRIGGER_SECRET_KEY from TRIGGER_API_KEY for Trigger SDK compatibility', () => {
    const env = {
      TRIGGER_API_KEY: 'api-token',
    } as unknown as NodeJS.ProcessEnv

    expect(ensureTriggerSecretKey(env)).toBe('api-token')
    expect(env.TRIGGER_SECRET_KEY).toBe('api-token')
  })

  it('returns null when no Trigger auth token exists', () => {
    const env = {} as unknown as NodeJS.ProcessEnv

    expect(getTriggerAuthToken(env)).toBeNull()
    expect(ensureTriggerSecretKey(env)).toBeNull()
    expect(isTriggerConfigured(env)).toBe(false)
  })

  it('treats placeholder trigger values as unconfigured', () => {
    const env = {
      TRIGGER_API_KEY: 'tr_placeholder',
      TRIGGER_SECRET_KEY: 'placeholder-secret',
    } as unknown as NodeJS.ProcessEnv

    expect(getTriggerAuthToken(env)).toBeNull()
    expect(ensureTriggerSecretKey(env)).toBeNull()
    expect(isTriggerConfigured(env)).toBe(false)
  })
})
