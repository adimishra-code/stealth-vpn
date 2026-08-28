// Payment flows (PAY-03/PAY-06): the billing page renders all plans, routes
// Razorpay orders to the checkout overlay, and Stripe sessions to the
// redirect URL. API hooks are mocked; razorpay is stubbed at the window.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Billing from '../../pages/Billing'
import { renderWithProviders } from '../../test/test-utils'

const { createOrder, createStripeSession, verifyPayment, confirmStripe, downgradePlan, cancelSubscription } = vi.hoisted(() => ({
  createOrder: vi.fn(),
  createStripeSession: vi.fn(),
  verifyPayment: vi.fn(),
  confirmStripe: vi.fn(),
  downgradePlan: vi.fn(),
  cancelSubscription: vi.fn(),
}))

vi.mock('../../features/payment/paymentApi', () => ({
  useListInvoicesQuery: () => ({
    data: { invoices: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateOrderMutation: () => [createOrder, { isLoading: false }],
  useCreateStripeSessionMutation: () => [createStripeSession, { isLoading: false }],
  useVerifyPaymentMutation: () => [verifyPayment, { isLoading: false }],
  useConfirmStripeMutation: () => [confirmStripe, { isLoading: false }],
  useDowngradePlanMutation: () => [downgradePlan, { isLoading: false }],
  useCancelSubscriptionMutation: () => [cancelSubscription, { isLoading: false }],
}))

vi.mock('../../utils/razorpay', () => ({
  loadRazorpay: vi.fn(async () => {
    window.Razorpay = class {
      constructor(options) {
        window.__lastRzpHandler = options.handler
      }
      open() {}
    }
  }),
}))

const assignSpy = vi.fn()
const reloadSpy = vi.fn()

beforeEach(() => {
  createOrder.mockReset().mockImplementation(() => ({
    unwrap: async () => ({ amount: 19900, currency: 'INR', orderId: 'order_xyz' }),
  }))
  createStripeSession.mockReset().mockImplementation(() => ({
    unwrap: async () => ({ sessionUrl: 'https://checkout.stripe.com/c/pay_test' }),
  }))
  verifyPayment.mockReset().mockImplementation(() => ({
    unwrap: async () => ({
      config: '[Interface]\nPrivateKey=abc\n',
      qrDataUrl: 'data:image/png;base64,AAA',
      vlessUri: 'vless://abc',
      vlessQrDataUrl: 'data:image/png;base64,BBB',
      device: { deviceName: 'billing-sub', plan: 'pro' },
    }),
  }))
  assignSpy.mockReset()
  reloadSpy.mockReset()
  window.__lastRzpHandler = null
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { origin: 'https://app.example.com', assign: assignSpy, reload: reloadSpy },
  })
  delete window.Razorpay
})

function renderBilling() {
  return renderWithProviders(<Billing />, {
    preloadedState: { auth: { user: { role: 'user', plan: 'basic' }, accessToken: 'jwt', loading: false } },
  })
}

describe('Billing page (PAY-03)', () => {
  it('renders all three plans with their prices', () => {
    renderBilling()

    expect(screen.getByText('₹99')).toBeInTheDocument()
    expect(screen.getByText('₹199')).toBeInTheDocument()
    expect(screen.getByText('₹499')).toBeInTheDocument()
  })

  it('routes a Razorpay subscription to the checkout overlay', async () => {
    const user = userEvent.setup()
    renderBilling()

    // Three plans × two buttons (INR = Razorpay, USD = Stripe); pick the pro plan's INR.
    const inrButtons = screen.getAllByRole('button', { name: 'INR' })
    await user.click(inrButtons[1])

    await waitFor(() =>
      expect(createOrder).toHaveBeenCalledWith({
        plan: 'pro',
        serverNode: 'auto',
        deviceName: 'billing-sub',
        mode: 'stealth',
      })
    )

    await waitFor(() => expect(window.Razorpay).toBeDefined())

    // Drive the Razorpay success handler and assert the delivery modal
    // opens (config + QR delivered) instead of a full-page reload.
    await act(async () => {
      await window.__lastRzpHandler({
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_xyz',
        razorpay_signature: 'sig',
      })
    })

    await waitFor(() => expect(verifyPayment).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Device ready')).toBeInTheDocument())
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('routes a Stripe subscription to the session redirect URL', async () => {
    const user = userEvent.setup()
    renderBilling()

    await user.click(screen.getAllByRole('button', { name: 'USD' })[0])

    await waitFor(() =>
      expect(createStripeSession).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'basic', successUrl: expect.stringContaining('/billing?session_id=') })
      )
    )
    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay_test')
    )
  })

  it('opens downgrade modal and submits plan downgrade', async () => {
    downgradePlan.mockImplementation(() => ({
      unwrap: async () => ({ message: 'Plan changed to BASIC', user: { plan: 'basic' } }),
    }))
    const user = userEvent.setup()
    renderBilling()

    const changeBtn = screen.getByRole('button', { name: /Change \/ Downgrade/i })
    await user.click(changeBtn)

    expect(screen.getByText('Change / Downgrade Plan')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /Confirm Change/i })
    await user.click(confirmBtn)

    await waitFor(() =>
      expect(downgradePlan).toHaveBeenCalledWith({ targetPlan: 'basic' })
    )
  })

  it('opens cancel modal and submits subscription cancellation', async () => {
    cancelSubscription.mockImplementation(() => ({
      unwrap: async () => ({ message: 'Subscription cancelled', user: { plan: 'free' } }),
    }))
    const user = userEvent.setup()
    renderBilling()

    const cancelBtn = screen.getByRole('button', { name: /Cancel subscription/i })
    await user.click(cancelBtn)

    expect(screen.getByText('Cancel VPN Subscription')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /Yes, Cancel Subscription/i })
    await user.click(confirmBtn)

    await waitFor(() =>
      expect(cancelSubscription).toHaveBeenCalled()
    )
  })
})

