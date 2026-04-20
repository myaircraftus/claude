const TRIGGER_ENV_KEYS = ['TRIGGER_SECRET_KEY', 'TRIGGER_API_KEY'] as const

function isUsableTriggerToken(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return false
  return !/placeholder/i.test(trimmed)
}

export function getTriggerAuthToken(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of TRIGGER_ENV_KEYS) {
    const value = env[key]?.trim()
    if (isUsableTriggerToken(value)) {
      return value ?? null
    }
  }

  return null
}

export function ensureTriggerSecretKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = getTriggerAuthToken(env)

  if (!token) {
    return null
  }

  if (!env.TRIGGER_SECRET_KEY) {
    env.TRIGGER_SECRET_KEY = token
  }

  return token
}

export function isTriggerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(getTriggerAuthToken(env))
}
