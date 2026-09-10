import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import Billing from '../../pages/Billing'
import { renderWithProviders } from '../../test/test-utils'

vi.mock('../../features/payment/paymentApi', () => ({
  useListInvoicesQuery: () => ({
    data: { invoices: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateOrderMutation: () => [vi.fn(), { isLoading: false }],
  useCreateStripeSessionMutation: () => [vi.fn(), { isLoading: false }],
  useVerifyPaymentMutation: () => [vi.fn(), { isLoading: false }],
  useConfirmStripeMutation: () => [vi.fn(), { isLoading: false }],
  useDowngradePlanMutation: () => [vi.fn(), { isLoading: false }],
  useCancelSubscriptionMutation: () => [vi.fn(), { isLoading: false }],
}))

function renderBilling(userOverrides = {}) {
  return renderWithProviders(<Billing />, {
    preloadedState: {
      auth: {
        user: { role: 'user', plan: 'pro', isApproved: true, planExpiresAt: new Date(Date.now() + 20 * 86400000), ...userOverrides },
        accessToken: 'jwt',
        loading: false,
      },
    },
  })
}

describe('Billing / Access & Membership page', () => {
  it('renders Free (Locked) and Pro (Friends Network) tiers with no mid plans', () => {
    renderBilling()

    expect(screen.getByText('Free (Locked)')).toBeInTheDocument()
    expect(screen.getByText('Pro (Friends Network)')).toBeInTheDocument()

    // No mid-tier plans
    expect(screen.queryByText('Basic')).not.toBeInTheDocument()
    expect(screen.queryByText('Team')).not.toBeInTheDocument()
  })

  it('displays Pro tier features: 2 devices, 100 Mbps max speed, and monthly 30-day cycle', () => {
    renderBilling()

    expect(screen.getByText('Max 2 devices')).toBeInTheDocument()
    expect(screen.getByText('100 Mbps max speed')).toBeInTheDocument()
    expect(screen.getByText('Strict limit: 2 devices')).toBeInTheDocument()
    expect(screen.getByText('Monthly 30-day access cycle')).toBeInTheDocument()
  })

  it('displays Free tier features: 0 allowed devices and key generation locked', () => {
    renderBilling()

    expect(screen.getByText('0 devices (locked)')).toBeInTheDocument()
    expect(screen.getByText('Key generation disabled')).toBeInTheDocument()
    expect(screen.getByText('0 allowed devices')).toBeInTheDocument()
    expect(screen.getByText('Requires administrator approval')).toBeInTheDocument()
  })

  it('shows PENDING APPROVAL indicator when user is on unapproved free tier', () => {
    renderBilling({ plan: 'free', isApproved: false, planExpiresAt: null })

    expect(screen.getByText('PENDING APPROVAL')).toBeInTheDocument()
    expect(
      screen.getByText(/An administrator must accept and approve your account before you can generate VPN keys/i)
    ).toBeInTheDocument()
  })

  it('shows ACTIVE indicator when user has active approved Pro plan', () => {
    renderBilling({ plan: 'pro', isApproved: true, planExpiresAt: new Date(Date.now() + 15 * 86400000) })

    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByText(/You can generate keys for up to/i)).toBeInTheDocument()
  })
})
