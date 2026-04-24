import type { SupabaseClient } from '@supabase/supabase-js'

export type ThreadRow = {
  id: string
  organization_id: string
  customer_id: string
  last_message_at: string | null
  last_message_snippet: string | null
  created_at: string
}

export type MessageRow = {
  id: string
  thread_id: string
  sender_user_id: string
  sender_role: 'owner' | 'mechanic'
  body: string
  created_at: string
}

export async function getOrCreateThread(
  service: SupabaseClient,
  orgId: string,
  customerId: string
): Promise<ThreadRow> {
  const { data: existing } = await service
    .from('portal_threads')
    .select('*')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .maybeSingle()
  if (existing) return existing as ThreadRow

  const { data: inserted, error } = await service
    .from('portal_threads')
    .insert({ organization_id: orgId, customer_id: customerId })
    .select('*')
    .single()
  if (error || !inserted) throw new Error(error?.message ?? 'Failed to create thread')
  return inserted as ThreadRow
}

export async function postMessage(
  service: SupabaseClient,
  args: {
    threadId: string
    senderUserId: string
    senderRole: 'owner' | 'mechanic'
    body: string
  }
): Promise<MessageRow> {
  const trimmed = args.body.trim()
  if (!trimmed) throw new Error('Message body is empty')
  if (trimmed.length > 4000) throw new Error('Message is too long (max 4000 chars)')

  const { data: message, error: msgErr } = await service
    .from('portal_messages')
    .insert({
      thread_id: args.threadId,
      sender_user_id: args.senderUserId,
      sender_role: args.senderRole,
      body: trimmed,
    })
    .select('*')
    .single()
  if (msgErr || !message) throw new Error(msgErr?.message ?? 'Failed to send')

  const snippet = trimmed.slice(0, 140)
  await service
    .from('portal_threads')
    .update({ last_message_at: message.created_at, last_message_snippet: snippet })
    .eq('id', args.threadId)

  return message as MessageRow
}
