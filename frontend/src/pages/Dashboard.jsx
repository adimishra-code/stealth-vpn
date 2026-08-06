import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectUser, setUser } from '../features/auth/authSlice'
import { useDispatch } from 'react-redux'
import { useListDevicesQuery } from '../features/devices/devicesApi'
import { useListServersQuery } from '../features/devices/serverApi'
import { useCreateOrderMutation, useVerifyPaymentMutation } from '../features/payment/paymentApi'
import DeviceCard from '../components/DeviceCard'
import BandwidthChart from '../components/BandwidthChart'
import ConfigDelivery from '../components/ConfigDelivery'
import PlanBadge from '../components/PlanBadge'

const PLAN_LIMITS = { free: 0, basic: 1, pro: 3, team: 10 }

export default function Dashboard() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const { data: devicesData } = useListDevicesQuery()
  const { data: serversData } = useListServersQuery()
  const [createOrder, { isLoading: creating }] = useCreateOrderMutation()
  const [verifyPayment, { isLoading: verifying }] = useVerifyPaymentMutation()

  const [showAdd, setShowAdd] = useState(false)
  const [step, setStep] = useState('form') // form | payment | delivery
  const [deviceName, setDeviceName] = useState('')
  const [serverNode, setServerNode] = useState('mumbai')
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

  const daysLeft = user?.planExpiresAt
    ? Math.max(0, Math.ceil((new Date(user.planExpiresAt) - new Date()) / 86400000))
    : 0

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
    if (typeof window.Razorpay === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://checkout.razorpay.com/v1/checkout.js'
        s.onload = resolve
        s.onerror = reject
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
      theme: { color: '#4f46e5' },
    }
    const rzp = new window.Razorpay(options)
    rzp.open()
  }

  return (
    <div className="space-y-8">
      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Plan</div>
          <PlanBadge plan={user?.plan || 'free'} />
        </div>
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Days left</div>
          <div className="text-2xl font-bold text-white">
            {daysLeft}
            <span className="text-sm font-normal text-slate-500"> days</span>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Devices</div>
          <div className="text-2xl font-bold text-white">
            {activeDevices}<span className="text-sm font-normal text-slate-500"> / {limit}</span>
          </div>
        </div>
        <div className="card flex flex-col justify-between">
          <div className="text-xs text-slate-500 mb-1">Subscription</div>
          {user?.plan && user.plan !== 'free' ? (
            <Link to="/billing" className="btn-primary !py-1.5 !px-3 text-xs text-center">
              Renew / Upgrade
            </Link>
          ) : (
            <Link to="/billing" className="btn-primary !py-1.5 !px-3 text-xs text-center">
              Subscribe
            </Link>
          )}
        </div>
      </div>

      {/* Add device */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Your devices</h2>
        <button
          onClick={() => {
            if (activeDevices >= limit) return
            setShowAdd(true)
            setStep('form')
            setError(null)
          }}
          disabled={activeDevices >= limit || (user?.plan === 'free')}
          className="btn-primary text-sm disabled:opacity-40"
          title={activeDevices >= limit ? `Plan limit reached (${limit})` : 'Add device'}
        >
          + Add device
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">📡</div>
          <p className="text-slate-400">No devices yet.</p>
          <p className="text-sm text-slate-500 mt-1">Add your first device to get your VPN config.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
        </div>
      )}

      <BandwidthChart />

      {/* Add device modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowAdd(false)}>
          <div
            className="bg-stealth-900 border border-stealth-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {step === 'form' && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Add device</h2>
                    <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-white">✕</button>
                  </div>
                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400 text-sm rounded-lg p-3 mb-4">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleCreateOrder} className="space-y-4">
                    <div>
                      <label className="label">Device name</label>
                      <input
                        className="input"
                        required
                        maxLength={64}
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder="My Laptop"
                      />
                    </div>
                    <div>
                      <label className="label">Server node</label>
                      <select className="input" value={serverNode} onChange={(e) => setServerNode(e.target.value)}>
                        {servers.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name} — {s.region} ({s.isOnline ? 'online' : 'offline'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Mode</label>
                      <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                        <option value="stealth">Stealth (cloaked HTTPS — bypasses DPI)</option>
                        <option value="gaming">Gaming (raw WG — +2–4ms)</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Plan</label>
                      <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
                        <option value="basic">Basic — ₹99/mo · 1 device</option>
                        <option value="pro">Pro — ₹199/mo · 3 devices</option>
                        <option value="team">Team — ₹499/mo · 10 devices</option>
                      </select>
                    </div>
                    <button type="submit" disabled={creating} className="btn-primary w-full disabled:opacity-50">
                      {creating ? 'Creating order...' : `Continue to payment (₹${(amount || 0) / 100})`}
                    </button>
                  </form>
                </>
              )}

              {step === 'payment' && (
                <>
                  <h2 className="text-xl font-bold text-white mb-4">Confirm payment</h2>
                  <p className="text-sm text-slate-400 mb-6">
                    Order <span className="text-white font-mono">{orderId}</span> · ₹{amount / 100}
                  </p>
                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400 text-sm rounded-lg p-3 mb-4">
                      {error}
                    </div>
                  )}
                  <button onClick={loadRazorpay} disabled={verifying} className="btn-primary w-full disabled:opacity-50">
                    {verifying ? 'Verifying...' : 'Pay with Razorpay'}
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
