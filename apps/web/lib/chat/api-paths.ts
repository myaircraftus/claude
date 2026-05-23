/**
 * Persona-aware URL builders for the per-WO chat. Centralised so the
 * WorkOrderChatBubble + WoChatTimeline don't sprinkle conditionals.
 *
 * Shop persona hits the org-scoped endpoints under /api/work-orders/...
 * Owner persona hits the portal-customer-scoped mirrors under
 * /api/owner/work-orders/... — same payload contracts, different auth.
 */
export type ChatPersona = 'owner' | 'shop'

function root(persona: ChatPersona): string {
  return persona === 'owner' ? '/api/owner' : '/api'
}

export function aircraftListUrl(persona: ChatPersona): string {
  return persona === 'owner' ? '/api/owner/aircraft' : '/api/aircraft'
}

export function aircraftChatSummaryUrl(persona: ChatPersona, aircraftId: string): string {
  return persona === 'owner'
    ? `/api/owner/aircraft/${aircraftId}/chat-summary`
    : `/api/aircraft/${aircraftId}/chat-summary`
}

export function woMessagesUrl(persona: ChatPersona, workOrderId: string): string {
  return `${root(persona)}/work-orders/${workOrderId}/messages`
}

export function woUploadUrl(persona: ChatPersona, workOrderId: string): string {
  return `${root(persona)}/work-orders/${workOrderId}/messages/upload`
}

export function woSignUrlUrl(persona: ChatPersona, workOrderId: string): string {
  return `${root(persona)}/work-orders/${workOrderId}/messages/sign-url`
}

export function unreadRollupUrl(persona: ChatPersona): string {
  return persona === 'owner'
    ? '/api/owner/work-orders/messages-unread'
    : '/api/work-orders/messages-unread'
}
