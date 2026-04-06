import type { OrgRole } from '@/types'

const WRITE_ROLES: OrgRole[] = ['owner', 'admin', 'mechanic']

export function canWriteParts(role: OrgRole): boolean {
  return WRITE_ROLES.includes(role)
}

export function canReadParts(_role: OrgRole): boolean {
  return true // all org members can read
}
