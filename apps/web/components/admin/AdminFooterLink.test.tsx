/**
 * Phase 18 Sprint 18.2 — AdminFooterLink visibility tests.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminFooterLink } from './AdminFooterLink'

describe('AdminFooterLink', () => {
  it('renders nothing for non-admin users', () => {
    const { container } = render(<AdminFooterLink isPlatformAdmin={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the link when isPlatformAdmin=true', () => {
    render(<AdminFooterLink isPlatformAdmin={true} />)
    expect(screen.getByTestId('admin-footer-link')).toBeInTheDocument()
    expect(screen.getByText('Admin Console')).toBeInTheDocument()
  })

  it('default href is /admin/command-center', () => {
    render(<AdminFooterLink isPlatformAdmin={true} />)
    const link = screen.getByTestId('admin-footer-link')
    expect(link.getAttribute('href')).toBe('/admin/command-center')
  })

  it('hides the label text when collapsed', () => {
    render(<AdminFooterLink isPlatformAdmin={true} collapsed={true} />)
    expect(screen.queryByText('Admin Console')).not.toBeInTheDocument()
    // Icon-only link still has the testid + title for tooltip
    expect(screen.getByTestId('admin-footer-link')).toHaveAttribute('title', 'Admin Console')
  })
})
