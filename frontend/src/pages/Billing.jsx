import { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { selectUser, setUser } from '../features/auth/authSlice'
import {
  useListInvoicesQuery,
  useCreateOrderMutation,
  useCreateStripeSessionMutation,
  useVerifyPaymentMutation,
  useConfirmStripeMutation,
  useDowngradePlanMutation,
  useCancelSubscriptionMutation,
} from '../features/payment/paymentApi'
import { Check, Loader2, AlertTriangle, ShieldAlert, ArrowDownCircle, XCircle } from 'lucide-react'
import { loadRazorpay } from '../utils/razorpay'
import { toast } from '../lib/toast'
import ConfigDelivery from '../components/ConfigDelivery'

const plans = [
  { name: 'basic', inr: '₹99', usd: '$1.99', devices: 1, speed: '500 GB/mo', highlight: false },
  { name: 'pro', inr: '₹199', usd: '$3.99', devices: 3, speed: 'Unlimited', highlight: true },
  { name: 'team', inr: '₹499', usd: '$9.99', devices: 10, speed: 'Unlimited', highlight: false },
]

const statusStyles = {
  paid: 'chip-ok',
  pending: 'chip-warn',
  failed: 'chip-danger',
  refunded: 'chip-muted',
  abandoned: 'chip-muted',
}

export default function Billing() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const { data: invoicesData, isLoading: invoicesLoading, isError: invoicesError, refetch } = useListInvoicesQuery()
  const [createOrder] = useCreateOrderMutation()
  const [createStripeSession] = useCreateStripeSessionMutation()
  const [verifyPayment, { isLoading: verifying }] = useVerifyPaymentMutation()
  const [confirmStripe, { isLoading: confirmingStripe }] = useConfirmStripeMutation()
  const [downgradePlan, { isLoading: downgrading }] = useDowngradePlanMutation()
  const [cancelSubscription, { isLoading: cancelling }] = useCancelSubscriptionMutation()

  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [pendingPlan, setPendingPlan] = useState(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [selectedDowngradePlan, setSelectedDowngradePlan] = useState('basic')
  const [cancelReason, setCancelReason] = useState('')
  const stripeProcessedRef = useRef(false)

  const invoices = invoicesData?.invoices || []
  const isPaidUser = user?.plan && user.plan !== 'free'

  const handleRazorpaySuccess = async (plan, paymentResponse) => {
    setPendingPlan(plan)
    try {
      const verify = await verifyPayment({
        paymentId: paymentResponse.razorpay_payment_id,
        orderId: paymentResponse.razorpay_order_id,
        signature: paymentResponse.razorpay_signature,
        plan,
        serverNode: 'auto',
        deviceName: 'billing-sub',
        mode: 'stealth',
      }).unwrap()
      setResult(verify)
      dispatch(setUser({ ...user, plan: verify.device?.plan || plan }))
      toast.success('Payment received — your VPN is ready')
    } catch (err) {
      toast.error(err?.data?.error ?? 'Payment verification failed. The webhook will retry.')
    } finally {
      setPendingPlan(null)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const cancelled = params.get('cancelled')

    if (cancelled) {
      toast.error('Payment checkout was cancelled')
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (sessionId && !stripeProcessedRef.current) {
      stripeProcessedRef.current = true
      window.history.replaceState({}, document.title, window.location.pathname)
      setPendingPlan('Stripe')
      confirmStripe({ session_id: sessionId })
        .unwrap()
        .then((res) => {
          if (res.config) {
            setResult(res)
          }
          refetch()
          toast.success('Payment verified — your VPN is ready')
        })
        .catch((err) => {
          if (err?.data?.alreadyProcessed || err?.status === 409) {
            refetch()
            toast.success('Payment verified — your subscription is active')
          } else {
            toast.error(err?.data?.error ?? 'Payment confirmation failed')
          }
        })
        .finally(() => {
          setPendingPlan(null)
        })
    }
  }, [confirmStripe, refetch])

  const handleSubscribe = async (plan, gateway) => {
    setError(null)
    setBusy(plan)
    try {
      if (gateway === 'razorpay') {
        const res = await createOrder({ plan, serverNode: 'auto', deviceName: 'billing-sub', mode: 'stealth' }).unwrap()
        try {
          await loadRazorpay()
        } catch {
          toast.error('Payment system unavailable — please refresh the page and try again.')
          return
        }
        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: res.amount,
          currency: res.currency,
          name: 'StealthVPN',
          description: `${plan.toUpperCase()} plan`,
          order_id: res.orderId,
          handler: (paymentResponse) => handleRazorpaySuccess(plan, paymentResponse),
          modal: {
            ondismiss: () => setBusy(null),
          },
          theme: { color: '#2dd4bf' },
        }
        new window.Razorpay(options).open()
      } else {
        const res = await createStripeSession({
          plan,
          serverNode: 'auto',
          deviceName: 'billing-sub',
          mode: 'stealth',
          successUrl: `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/billing?cancelled=1`,
        }).unwrap()
        window.location.assign(res.sessionUrl)
      }
    } catch (err) {
      setError(err.data?.error || 'Payment failed')
    } finally {
      setBusy(null)
    }
  }

  const handleConfirmDowngrade = async () => {
    try {
      const res = await downgradePlan({ targetPlan: selectedDowngradePlan }).unwrap()
      dispatch(setUser({ ...user, ...res.user }))
      toast.success(res.message || `Plan changed to ${selectedDowngradePlan.toUpperCase()}`)
      setShowDowngradeModal(false)
      refetch()
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to downgrade plan')
    }
  }

  const handleConfirmCancel = async () => {
    try {
      const res = await cancelSubscription({ reason: cancelReason }).unwrap()
      dispatch(setUser({ ...user, ...res.user }))
      toast.success(res.message || 'Subscription cancelled successfully')
      setShowCancelModal(false)
      refetch()
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to cancel subscription')
    }
  }

  const isCurrent = (name) => user?.plan === name

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Billing & Plans</h1>
        <p className="text-sm text-muted mt-1">
          Manage your subscription, change plan tiers, or review payment invoices.
        </p>
      </div>

      {/* Active Subscription Summary & Self-Service Management */}
      <div className="card border-line-strong p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-faint uppercase tracking-wider">Current Tier:</span>
            <span className="font-mono font-bold uppercase text-accent-400 text-base px-2.5 py-0.5 rounded-sm bg-accent-400/10 border border-accent-400/30">
              {user?.plan || 'FREE'}
            </span>
          </div>
          <p className="text-xs text-muted mt-2">
            {user?.planExpiresAt ? (
              <span>Active through <strong className="text-ink font-mono">{new Date(user.planExpiresAt).toLocaleDateString()}</strong></span>
            ) : isPaidUser ? (
              <span>Recurring monthly subscription</span>
            ) : (
              <span>Free tier — limited bandwidth and slots. Upgrade to unlock full speed and multiple devices.</span>
            )}
          </p>
        </div>

        {isPaidUser && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                setSelectedDowngradePlan(user?.plan === 'team' ? 'pro' : 'basic')
                setShowDowngradeModal(true)
              }}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <ArrowDownCircle size={14} className="text-muted" />
              Change / Downgrade
            </button>
            <button
              onClick={() => setShowCancelModal(true)}
              className="btn-secondary !border-danger/40 !text-danger hover:!bg-danger/10 text-xs flex items-center gap-1.5"
            >
              <XCircle size={14} />
              Cancel subscription
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 animate-fade-in">
          {error}
        </div>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl items-start">
        {plans.map((p, i) => (
          <div
            key={p.name}
            className={`relative p-8 rounded-2xl animate-fade-up transition-all duration-200 ${
              p.highlight
                ? 'bg-surface border-2 border-accent-400/40 shadow-[var(--shadow-card-hover),var(--shadow-glow-accent)] scale-[1.03] hover:scale-[1.05] hover:shadow-[var(--shadow-card-hover),var(--shadow-glow-accent-strong)] z-10'
                : 'bg-surface border border-line shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 hover:border-accent-400/20'
            }`}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {p.highlight && (
              <>
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-400 to-transparent rounded-t-2xl" />
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent-400 text-void text-xs font-bold rounded-full tracking-wide whitespace-nowrap shadow-[var(--shadow-glow-accent)]">
                  MOST POPULAR
                </div>
              </>
            )}
            {isCurrent(p.name) && (
              <span className="absolute top-3.5 right-4 chip-muted">
                <Check size={11} className="text-accent-400" />
                current
              </span>
            )}

            <h3 className="font-display text-lg font-semibold text-ink capitalize">{p.name}</h3>
            <div className="mt-6 mb-6">
              <span className="text-5xl font-bold text-ink tracking-tight tabular-nums">{p.inr}</span>
              <span className="text-sm text-muted">/month</span>
              <div className="font-mono text-xs text-faint mt-1">{p.usd} international</div>
            </div>

            <ul className="space-y-2.5 text-sm text-muted mb-7">
              {[`${p.devices} device${p.devices > 1 ? 's' : ''}`, p.speed, 'All server locations', 'Stealth + Gaming modes'].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check size={14} className="text-accent-400 shrink-0" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <button
                onClick={() => handleSubscribe(p.name, 'razorpay')}
                disabled={busy === p.name}
                className={`${p.highlight ? 'btn-primary' : 'btn-secondary'} flex-1 text-xs disabled:opacity-50`}
              >
                {busy === p.name ? <Loader2 size={13} className="animate-spin" /> : 'INR'}
              </button>
              <button
                onClick={() => handleSubscribe(p.name, 'stripe')}
                disabled={busy === p.name}
                className={`${p.highlight ? 'btn-primary' : 'btn-secondary'} flex-1 text-xs disabled:opacity-50`}
              >
                {busy === p.name ? <Loader2 size={13} className="animate-spin" /> : 'USD'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Invoice History */}
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">Invoice history</h2>
        {invoicesLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
          </div>
        ) : invoicesError ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-danger">Failed to load invoices.</p>
            <button onClick={refetch} className="btn-secondary text-xs shrink-0">Retry</button>
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-faint">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-faint border-b border-line">
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Date</th>
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Plan</th>
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Amount</th>
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Gateway</th>
                  <th className="pb-3 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id} className="border-b border-line/60 last:border-0 transition-colors duration-fast hover:bg-raised/50">
                    <td className="py-3.5 pr-4 text-muted">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="py-3.5 pr-4 font-mono uppercase text-ink">{inv.plan}</td>
                    <td className="py-3.5 pr-4 font-mono text-ink">
                      {inv.currency === 'USD' ? '$' : '₹'}{(inv.amount / 100).toFixed(2)}{' '}
                      <span className="text-faint">{inv.currency}</span>
                    </td>
                    <td className="py-3.5 pr-4 capitalize text-muted">{inv.gateway}</td>
                    <td className="py-3.5">
                      <span className={statusStyles[inv.status]}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Downgrade Modal */}
      {showDowngradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[4px] p-4 animate-fade-in">
          <div className="bg-surface border border-line-strong rounded-2xl shadow-card max-w-md w-full p-6 space-y-5">
            <div className="flex items-center gap-3 text-warn">
              <AlertTriangle size={24} />
              <h3 className="font-display font-semibold text-ink text-lg">Change / Downgrade Plan</h3>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Selecting a lower plan tier will adjust your allowed device slots. Any excess devices above the new plan tier limit will be automatically deprovisioned based on least-recently-used (LRU) activity.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-mono text-faint uppercase">Select target plan</label>
              <div className="grid grid-cols-2 gap-2">
                {['basic', 'free'].map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSelectedDowngradePlan(tier)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedDowngradePlan === tier
                        ? 'border-accent-400 bg-accent-400/10 text-ink font-semibold'
                        : 'border-line bg-void text-muted hover:border-line-strong'
                    }`}
                  >
                    <div className="capitalize text-sm font-bold">{tier}</div>
                    <div className="text-2xs text-faint mt-1 font-mono">
                      {tier === 'basic' ? '1 device · 500GB' : '0 paid slots'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDowngradeModal(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDowngrade}
                disabled={downgrading}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                {downgrading ? <Loader2 size={13} className="animate-spin" /> : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[4px] p-4 animate-fade-in">
          <div className="bg-surface border border-danger/40 rounded-2xl shadow-card max-w-md w-full p-6 space-y-5">
            <div className="flex items-center gap-3 text-danger">
              <ShieldAlert size={24} />
              <h3 className="font-display font-semibold text-ink text-lg">Cancel VPN Subscription</h3>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to cancel your active subscription? Your recurring billing will be stopped at the payment gateway, and your account will immediately revert to the <strong>Free tier</strong>. Active VPN device keys exceeding Free limit will be deprovisioned.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-faint">Reason for cancellation (optional):</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Switched network provider"
                className="input text-xs w-full"
                maxLength={200}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="btn-secondary text-xs"
              >
                Keep My Plan
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="btn-secondary !border-danger !bg-danger/20 !text-danger text-xs flex items-center gap-1.5"
              >
                {cancelling ? <Loader2 size={13} className="animate-spin" /> : 'Yes, Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(verifying || confirmingStripe) && pendingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[4px] p-4 animate-fade-in">
          <div className="bg-surface border border-line-strong rounded-2xl shadow-card max-w-sm w-full p-8 text-center">
            <Loader2 size={32} className="text-accent-400 animate-spin mx-auto mb-4" strokeWidth={1.75} />
            <p className="text-sm text-ink font-medium">Provisioning your VPN…</p>
            <p className="text-xs text-faint mt-1.5">Generating keys and configuring the node.</p>
          </div>
        </div>
      )}

      {result && (
        <ConfigDelivery
          config={result.config}
          qrDataUrl={result.qrDataUrl}
          vlessUri={result.vlessUri}
          vlessQrDataUrl={result.vlessQrDataUrl}
          deviceName={result.device?.deviceName || pendingPlan || 'device'}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  )
}