/**
 * Phase 18 Sprint 18.2 — PersonaSwitcher dropdown tests.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonaSwitcher } from './PersonaSwitcher'

describe('PersonaSwitcher', () => {
  it('renders nothing when user has no operational persona (admin-only)', () => {
    const { container } = render(
      <PersonaSwitcher
        availablePersonas={['admin']}
        currentPersona="admin"
        onSwitch={() => {}}
      />,
    )
    expect(container.textContent ?? '').toBe('')
  })

  it('renders a static chip (no dropdown) when user has only one operational persona', () => {
    render(
      <PersonaSwitcher
        availablePersonas={['owner']}
        currentPersona="owner"
        onSwitch={() => {}}
      />,
    )
    expect(screen.getByTestId('persona-switcher-static')).toBeInTheDocument()
    expect(screen.queryByTestId('persona-switcher')).not.toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })

  it('filters admin out of the dropdown options when admin is in availablePersonas', () => {
    // Even if the parent passes ['owner','shop','admin'], admin must not
    // appear in the dropdown list (admin lives in the footer).
    render(
      <PersonaSwitcher
        availablePersonas={['owner', 'shop', 'admin']}
        currentPersona="shop"
        onSwitch={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('persona-switcher').querySelector('button')!)
    expect(screen.getByRole('option', { name: /Owner/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Shop/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Admin/ })).not.toBeInTheDocument()
  })

  it('calls onSwitch with the selected persona', () => {
    const onSwitch = vi.fn()
    render(
      <PersonaSwitcher
        availablePersonas={['owner', 'shop']}
        currentPersona="owner"
        onSwitch={onSwitch}
      />,
    )
    fireEvent.click(screen.getByTestId('persona-switcher').querySelector('button')!)
    fireEvent.click(screen.getByRole('option', { name: /Shop/ }))
    expect(onSwitch).toHaveBeenCalledWith('shop')
  })

  it('does not call onSwitch when the current persona is re-selected', () => {
    const onSwitch = vi.fn()
    render(
      <PersonaSwitcher
        availablePersonas={['owner', 'shop']}
        currentPersona="shop"
        onSwitch={onSwitch}
      />,
    )
    fireEvent.click(screen.getByTestId('persona-switcher').querySelector('button')!)
    fireEvent.click(screen.getByRole('option', { name: /Shop/ }))
    expect(onSwitch).not.toHaveBeenCalled()
  })
})
