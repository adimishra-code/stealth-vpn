import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router'
import { selectUser, setUser } from '../features/auth/authSlice'
import { useDispatch } from 'react-redux'
import { useListDevicesQuery } from '../features/devices/devicesApi'
import { useListServersQuery } from '../features/devices/serverApi'
import { useCreateOrderMutation, useVerifyPaymentMutation } from '../features/payment/paymentApi'
import DeviceCard from '../components/DeviceCard'
import BandwidthChart from '../components/BandwidthChart'
import ConfigDelivery from '../components/ConfigDelivery'
import ProtectionStatus from '../components/ProtectionStatus'
import { Plus, MonitorSmartphone, X, ArrowRight } from 'lucide-react'

const PLAN_LIMITS = { free: 0, basic: 1, pro: 3, team: 10 }

export default function Dashboard() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const { data: devicesData, isLoading: devicesLoading, isError: devicesError, refetch: refetchDevices } = useListDevicesQuery()
  const { data: serversData, isLoading: serversLoading, isError: serversError } = useListServersQuery()
  const [createOrder, { isLoading: creating }] = useCreateOrderMutation()
  const [verifyPayment, { isLoading: verifying }] = useVerifyPaymentMutation()

  const [showAdd, setShowAdd] = useState(false)
  const [step, setStep] = useState('form') // form | payment | delivery
  const [deviceName, setDeviceName] = useState('')
  const [serverNode, setServerNode] = useState('auto')
  const [mode, setMode] = useState('stealth')
  const [plan, setPlan] = useState('pro')
  const [orderId, setOrderId] = useState(null)
  const [amount, setAmount] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const devices = devicesData?.devices || []
  const servers = serversData?.servers || []
  const limit = PLAN_LIMITS[user?.plan] || 0
  const activeDevices = devices.filter((d) => d.isActive).length
  const serversOnline = servers.filter((s) => s.isOnline).length

  const daysLeft = user?.planExpiresAt
    ? Math.max(0, Math.ceil((new Date(user.planExpiresAt) - new Date()) / 86400000))
    : 0
  const renewingSoon = user?.plan !== 'free' && daysLeft <= 3

  const handleCreateOrder = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await createOrder({ plan, serverNode, deviceName, mode }).unwrap()
      setOrderId(res.orderId)
      setAmount(res.amount)
      setStep('payment')
    } catch (err) {
      setError(err.data?.error || 'Failed to create order')
    }
  }

  const handleRazorpaySuccess = async (paymentResponse) => {
    try {
      const res = await verifyPayment({
        paymentId: paymentResponse.razorpay_payment_id,
        orderId: paymentResponse.razorpay_order_id,
        signature: paymentResponse.razorpay_signature,
        plan,
        serverNode,
        deviceName,
        mode,
      }).unwrap()
      setResult(res)
      dispatch(setUser({ ...user, plan: res.device?.plan || plan }))
      setStep('delivery')
    } catch (err) {
      setError(err.data?.error || 'Payment verification failed')
    }
  }

  const loadRazorpay = async () => {
    try {
      if (typeof window.Razorpay === 'undefined') {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload = resolve
          s.onerror = () => reject(new Error('Razorpay script failed to load'))
          document.body.appendChild(s)
        })
      }
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount,
        currency: 'INR',
        name: 'StealthVPN',
        description: `${plan.toUpperCase()} plan`,
        order_id: orderId,
        handler: handleRazorpaySuccess,
        modal: { ondismiss: () => setStep('form') },
        theme: { color: '#2dd4bf' },
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch {
      setError('Payment system unavailable — please refresh the page and try again.')
    }
  }

  const stats = [
    {
      label: 'Active devices',
      value: activeDevices,
      sub: `${limit} allowed on ${(user?.plan || 'free').toUpperCase()}`,
      accent: true,
    },
    {
      label: 'Servers online',
      value: serversLoading ? '…' : serversError ? '—' : `${serversOnline}/${servers.length}`,
      sub: serversLoading
        ? 'checking nodes'
        : serversError
          ? 'nodes unavailable'
          : servers.length
            ? (serversOnline === servers.length ? 'all nodes up' : 'degraded')
            : '—',
      ok: !serversError && !serversLoading && serversOnline === servers.length && servers.length > 0,
      warn: serversError || (!serversLoading && servers.length > 0 && serversOnline < servers.length),
    },
    {
      label: 'Plan expires',
      value: user?.plan !== 'free' && daysLeft > 0 ? `${daysLeft}d` : user?.plan === 'free' ? '—' : 'expired',
      sub: user?.plan !== 'free' ? (user?.plan || 'free').toUpperCase() : 'free tier',
      warn: renewingSoon,
    },
  ]

  return (
    <div className="space-y-8">
      <ProtectionStatus devices={devices} plan={user?.plan} daysLeft={daysLeft} />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`relative card animate-fade-up transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 ${s.accent ? '!pt-5' : ''}`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {s.accent && (
              <span className="absolute top-0 left-5 right-5 h-[2px] rounded-b bg-accent-400 shadow-[0_0_10px_rgba(45,212,191,0.6)]" />
            )}
            <p className="text-xs uppercase tracking-widest text-faint">{s.label}</p>
            <p className={`font-display text-4xl font-bold mt-2 tabular-nums ${
              s.accent ? 'text-accent-400' : s.ok ? 'text-ok' : s.warn ? 'text-warn' : 'text-ink'
            }`}>
              {s.value}
            </p>
            <p className="text-xs text-faint mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Add device */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink tracking-tight">Your devices</h2>
          <p className="text-sm text-faint mt-0.5">
            {activeDevices} of {limit} used on your {(user?.plan || 'free').toUpperCase()} plan
          </p>
        </div>
        <button
          onClick={() => {
            if (activeDevices >= limit) return
            setShowAdd(true)
            setStep('form')
            setError(null)
          }}
          disabled={activeDevices >= limit || (user?.plan === 'free')}
          className="btn-primary text-sm shrink-0"
          title={activeDevices >= limit ? `Plan limit reached (${limit})` : 'Add device'}
        >
          <Plus size={16} />
          Add device
        </button>
      </div>

      {devicesLoading && (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="skeleton h-[92px] rounded-xl" />)}
        </div>
      )}

      {devicesError && (
        <div className="card border-danger/30 flex items-center justify-between gap-4 py-4 px-5 animate-fade-in">
          <p className="text-sm text-danger">
            Failed to load your devices.
          </p>
          <button onClick={refetchDevices} className="btn-secondary text-xs shrink-0">Retry</button>
        </div>
      )}

      {!devicesError && devices.length === 0 ? (
        <div className="card text-center py-16 animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-raised/80 border border-line flex items-center justify-center mx-auto mb-4">
            <MonitorSmartphone size={28} className="text-faint" strokeWidth={1.5} />
          </div>
          <p className="text-ink font-medium">No devices yet</p>
          <p className="text-sm text-faint mt-1 max-w-sm mx-auto mb-6">
            Add your first device to generate an encrypted WireGuard config and QR code.
          </p>
          {user?.plan === 'free' ? (
            <Link
              to="/billing"
              className="btn-primary text-sm inline-flex items-center gap-1.5"
            >
              Upgrade to add devices
              <ArrowRight size={14} />
            </Link>
          ) : (
            <button
              onClick={() => {
                setShowAdd(true)
                setStep('form')
                setError(null)
              }}
              className="btn-primary text-sm"
            >
              <Plus size={16} />
              Add device
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((d, i) => (
            <div key={d.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 5) * 80}ms` }}>
              <DeviceCard device={d} />
            </div>
          ))}
        </div>
      )}

      <BandwidthChart />

      {/* Add device modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[4px] p-4 animate-fade-in" onClick={() => setShowAdd(false)}>
          <div
            className="bg-surface border border-line-strong rounded-2xl shadow-card max-w-lg w-full max-h-[90vh] overflow-y-auto animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {step === 'form' && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-xl font-semibold text-ink tracking-tight">Add device</h2>
                    <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg text-faint hover:text-ink hover:bg-raised transition-colors duration-fast" aria-label="Close">
                      <X size={18} />
                    </button>
                  </div>
                  {error && (
                    <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 mb-4 animate-fade-in">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleCreateOrder} className="space-y-4">
                    <div>
                      <label className="label" htmlFor="dv-name">Device name</label>
                      <input
                        id="dv-name"
                        className="input"
                        required
                        maxLength={64}
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder="My Laptop"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="dv-node">Server node</label>
                      <select id="dv-node" className="input" value={serverNode} onChange={(e) => setServerNode(e.target.value)}>
                        <option value="auto">Auto (recommended — least loaded)</option>
                        {servers.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name} — {s.region} ({s.isOnline ? 'online' : 'offline'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="dv-mode">Mode</label>
                      <select id="dv-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                        <option value="stealth">Stealth (cloaked HTTPS — bypasses DPI)</option>
                        <option value="gaming">Gaming (raw WG — +2–4ms)</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="dv-plan">Plan</label>
                      <select id="dv-plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
                        <option value="basic">Basic — ₹99/mo · 1 device</option>
                        <option value="pro">Pro — ₹199/mo · 3 devices</option>
                        <option value="team">Team — ₹499/mo · 10 devices</option>
                      </select>
                    </div>
                    <button type="submit" disabled={creating} className="btn-primary w-full disabled:opacity-50">
                      {creating ? 'Creating order…' : `Continue to payment (₹${(amount || 0) / 100})`}
                    </button>
                  </form>
                </>
              )}

              {step === 'payment' && (
                <>
                  <h2 className="font-display text-xl font-semibold text-ink mb-4">Confirm payment</h2>
                  <p className="text-sm text-muted mb-6">
                    Order <span className="text-ink font-mono">{orderId}</span> · ₹{amount / 100}
                  </p>
                  {error && (
                    <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 mb-4 animate-fade-in">
                      {error}
                    </div>
                  )}
                  <button onClick={loadRazorpay} disabled={verifying} className="btn-primary w-full disabled:opacity-50">
                    {verifying ? 'Verifying…' : 'Pay with Razorpay'}
                  </button>
                  <button
                    onClick={() => setStep('form')}
                    className="btn-secondary w-full mt-3"
                  >
                    ← Back
                  </button>
                </>
              )}

              {step === 'delivery' && result && (
                <ConfigDelivery
                  config={result.config}
                  qrDataUrl={result.qrDataUrl}
                  vlessUri={result.vlessUri}
                  deviceName={deviceName}
                  onClose={() => {
                    setShowAdd(false)
                    setStep('form')
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
