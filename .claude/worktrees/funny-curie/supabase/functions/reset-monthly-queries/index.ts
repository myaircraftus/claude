import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Cron: 0 0 1 * * (1st of each month)
Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { error, count } = await supabase
    .from('organizations')
    .update({
      queries_used_this_month: 0,
      queries_reset_at: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        1
      ).toISOString(),
    })
    .neq('id', '00000000-0000-0000-0000-000000000000') // update all rows

  if (error) {
    console.error('Error resetting query counts:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.log(`Reset query counts for all organizations`)
  return new Response(JSON.stringify({ success: true, reset_at: new Date().toISOString() }))
})
