import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const id = '03e526e8-7c9b-4bba-873a-c7ac4c606f4c'

  // Three ways to ask:
  const a = await s.from('documents').select('*').eq('id', id).maybeSingle()
  console.log('A. eq(id).maybeSingle():', a.data ? 'FOUND' : 'NOT FOUND', a.error?.message ?? '')
  if (a.data) console.log('  title=', a.data.title, ' status=', a.data.parsing_status, ' deleted=', a.data.deleted_at)

  const b = await s.from('documents').select('*').in('id', [id])
  console.log('B. in([id]):', b.data?.length ?? 0, 'rows', b.error?.message ?? '')
  if (b.data?.[0]) console.log('  title=', b.data[0].title, ' status=', b.data[0].parsing_status, ' deleted=', b.data[0].deleted_at)

  const c = await s.from('documents').select('id, title').like('id', '03e526e8%')
  console.log('C. LIKE 03e526e8%:', c.data?.length ?? 0, 'rows', c.error?.message ?? '')
}
main().catch(console.error)
