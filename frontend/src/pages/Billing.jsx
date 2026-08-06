import { useState } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../features/auth/authSlice'
import { useListInvoicesQuery, useCreateOrderMutation, useCreateStripeSessionMutation } from '../features/payment/paymentApi'

const plans = [
  { name: 'basic', inr: '₹99', usd: '$1.99', devices: 1 },
  { name: 'pro', inr: '₹199', usd: '$3.99', devices: 3 },
  { name: 'team', inr: '₹499', usd: '$9.99', devices: 10 },
]

const statusStyles = {
  paid: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40',
  pending: 'bg-amber-500/10 text-amber-400 border border-amber-500/40',
  failed: 'bg-rose-500/10 text-rose-400 border border-rose-500/40',
  refunded: 'bg-slate-700/40 text-slate-400 border border-slate-600/40',
}

export default function Billing() {
  const user = useSelector(selectUser)
  const { data: invoicesData } = useListInvoicesQuery()
  const [createOrder] = useCreateOrderMutation()
  const [createStripeSession] = useCreateStripeSessionMutation()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const invoices = invoicesData?.invoices || []

  const handleSubscribe = async (plan, gateway) => {
    setError(null)
    setBusy(plan)
    try {
      if (gateway === 'razorpay') {
        const res = await createOrder({ plan, serverNode: 'auto', deviceName: 'billing-sub', mode: 'stealth' }).unwrap()
        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: res.amount,
          currency: res.currency,
          name: 'StealthVPN',
          description: `${plan.toUpperCase()} plan`,
          order_id: res.orderId,
          handler: () => window.location.reload(),
          theme: { color: '#4f46e5' },
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
        window.location.href = res.sessionUrl
      }
    } catch (err) {
      setError(err.data?.error || 'Payment failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-sm text-slate-400 mt-1">
          Current plan: <span className="font-semibold uppercase text-stealth-400">{user?.plan}</span>
          {user?.planExpiresAt && (
            <span> · expires {new Date(user.planExpiresAt).toLocaleDateString()}</span>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.name} className={`card ${user?.plan === p.name ? 'border-stealth-500 ring-2 ring-stealth-500/30' : ''}`}>
            <h3 className="font-bold text-white capitalize">{p.name}</h3>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-extrabold text-white">{p.inr}</span>
              <span className="text-sm text-slate-500">/month</span>
              <div className="text-xs text-slate-500 mt-1">{p.usd} international</div>
            </div>
            <p className="text-xs text-slate-400 mb-4">{p.devices} device{p.devices > 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleSubscribe(p.name, 'razorpay')}
                disabled={busy === p.name}
                className="btn-primary flex-1 text-xs disabled:opacity-50"
              >
                {busy === p.name ? '...' : 'INR'}
              </button>
              <button
                onClick={() => handleSubscribe(p.name, 'stripe')}
                disabled={busy === p.name}
                className="btn-secondary flex-1 text-xs disabled:opacity-50"
              >
                {busy === p.name ? '...' : 'USD'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Invoices */}
      <div className="card">
        <h2 className="font-bold text-white mb-4">Invoice history</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-stealth-700">
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 pr-4 font-medium">Plan</th>
                  <th className="pb-3 pr-4 font-medium">Amount</th>
                  <th className="pb-3 pr-4 font-medium">Gateway</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id} className="border-b border-stealth-700/40 last:border-0">
                    <td className="py-3 pr-4 text-slate-300">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 pr-4 uppercase text-slate-300">{inv.plan}</td>
                    <td className="py-3 pr-4 text-slate-300">
                      {inv.currency === 'USD' ? '$' : '₹'}{(inv.amount / 100).toFixed(2)}{' '}
                      <span className="text-slate-500">{inv.currency}</span>
                    </td>
                    <td className="py-3 pr-4 capitalize text-slate-300">{inv.gateway}</td>
                    <td className="py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusStyles[inv.status]}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
