import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { selectUser, setUser } from '../features/auth/authSlice'
import { useListInvoicesQuery, useCreateOrderMutation, useCreateStripeSessionMutation, useVerifyPaymentMutation } from '../features/payment/paymentApi'
import { Check, Loader2 } from 'lucide-react'
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
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [pendingPlan, setPendingPlan] = useState(null)

  const invoices = invoicesData?.invoices || []

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
    const success = new URLSearchParams(window.location.search).get('success')
    if (success) {
      const lastInvoice = invoicesData?.invoices?.[invoicesData?.invoices.length - 1]
      if (lastInvoice && lastInvoice.gateway === 'stripe' && lastInvoice.status === 'paid') {
        toast.success('Payment verified — your VPN is ready')
      } else {
        toast.error('Payment verified but invoice not found')
      }
    }
  }, [invoicesData, user?.plan])

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
          successUrl: `${window.location.origin}/billing?success=1`,
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

  const isCurrent = (name) => user?.plan === name

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Billing</h1>
        <p className="text-sm text-muted mt-1">
          Current plan: <span className="font-mono font-semibold uppercase text-accent-400">{user?.plan}</span>
          {user?.planExpiresAt && (
            <span> · expires <span className="font-mono text-ink">{new Date(user.planExpiresAt).toLocaleDateString()}</span></span>
          )}
        </p>
      </div>

      {error && (
        <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 animate-fade-in">
          {error}
        </div>
      )}

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

      {verifying && pendingPlan && (
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