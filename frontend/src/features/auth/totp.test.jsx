// TOTP enrollment flow (AUTH-07): admin-only section, setup → QR + secret,
// verify with a 6-digit code, disable with a fresh code. Mocked API hooks.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from '../../pages/Settings'
import { renderWithProviders } from '../../test/test-utils'

const { setup, verify, disable, logoutAll } = vi.hoisted(() => ({
  setup: vi.fn(),
  verify: vi.fn(),
  disable: vi.fn(),
  logoutAll: vi.fn(),
}))

vi.mock('../../features/auth/authApi', () => ({
  useTotpSetupMutation: () => [setup, { isLoading: false }],
  useTotpVerifyMutation: () => [verify, { isLoading: false }],
  useTotpDisableMutation: () => [disable, { isLoading: false }],
  useLogoutAllMutation: () => [logoutAll, { isLoading: false }],
}))

function adminState(user = { role: 'admin', email: 'admin@example.com' }) {
  return { auth: { user, accessToken: 'jwt', loading: false } }
}

describe('TOTP settings (AUTH-07)', () => {
  beforeEach(() => {
    setup.mockReset().mockImplementation(() => ({
      unwrap: async () => ({ secret: 'ABCDEF123456', otpauth: 'otpauth://totp/StealthVPN' }),
    }))
    verify.mockReset().mockImplementation(() => ({ unwrap: async () => ({}) }))
    disable.mockReset().mockImplementation(() => ({ unwrap: async () => ({}) }))
    logoutAll.mockReset()
  })

  it('hides the TOTP section from non-admin users', () => {
    renderWithProviders(<Settings />, { preloadedState: adminState({ role: 'user' }) })

    expect(screen.queryByText('Two-factor authentication')).not.toBeInTheDocument()
  })

  it('runs setup, shows the secret, and verifies with a 6-digit code', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />, { preloadedState: adminState() })

    await user.click(screen.getByRole('button', { name: 'Enable two-factor' }))
    expect(setup).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(screen.getByText('ABCDEF123456')).toBeInTheDocument())
    expect(screen.getByText('Scan with your authenticator app')).toBeInTheDocument()

    const codeInput = screen.getByLabelText('Enter the 6-digit code from the app')
    await user.type(codeInput, '12345')
    // Activation stays disabled until the code is exactly 6 digits.
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()

    await user.type(codeInput, '6')
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    await waitFor(() => expect(verify).toHaveBeenCalledWith({ totpCode: '123456' }))
    expect(await screen.findByText('Two-factor authentication enabled.')).toBeInTheDocument()
  })

  it('shows the error message when verification fails', async () => {
    const user = userEvent.setup()
    verify.mockImplementation(() => ({
      unwrap: async () => {
        throw { data: { error: 'Invalid code' } }
      },
    }))
    renderWithProviders(<Settings />, { preloadedState: adminState() })

    await user.click(screen.getByRole('button', { name: 'Enable two-factor' }))
    await screen.findByText('ABCDEF123456')

    await user.type(screen.getByLabelText('Enter the 6-digit code from the app'), '000000')
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(await screen.findByText('Invalid code')).toBeInTheDocument()
  })

  it('disables TOTP with a valid current code', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />, {
      preloadedState: adminState({ role: 'admin', totpEnabled: true }),
    })

    await user.type(screen.getByLabelText('Current code to disable'), '654321')
    await user.click(screen.getByRole('button', { name: 'Disable two-factor' }))

    await waitFor(() => expect(disable).toHaveBeenCalledWith({ totpCode: '654321' }))
    expect(await screen.findByText('Two-factor authentication disabled.')).toBeInTheDocument()
  })

  it('rejects non-numeric input in the code field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Settings />, { preloadedState: adminState() })

    await user.click(screen.getByRole('button', { name: 'Enable two-factor' }))
    await screen.findByText('ABCDEF123456')

    const codeInput = screen.getByLabelText('Enter the 6-digit code from the app')
    fireEvent.change(codeInput, { target: { value: '12ab34' } })
    expect(codeInput.value).toBe('1234')
  })
})
