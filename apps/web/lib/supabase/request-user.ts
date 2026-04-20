import { createClient, type User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createServerSupabase } from './server'

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

export async function getRequestUser(req: NextRequest): Promise<User | null> {
  const bearerToken = getBearerToken(req)

  if (bearerToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser(bearerToken)

    if (user) return user
  }

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user ?? null
}
