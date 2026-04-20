import Constants from 'expo-constants'

interface AppExtraConfig {
  apiBaseUrl?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
}

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtraConfig

export function getApiBaseUrl() {
  return extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'https://myaircraft.us'
}

export function getSupabaseUrl() {
  return extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
}

export function getSupabaseAnonKey() {
  return extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
}
