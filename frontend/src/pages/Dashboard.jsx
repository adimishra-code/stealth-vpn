import { useState } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../features/auth/authSlice'
import { useListDevicesQuery, useAddDeviceMutation } from '../features/devices/devicesApi'
import { useListServersQuery } from '../features/devices/serverApi'
import { useRequestReactivationMutation } from '../features/auth/authApi'
import DeviceCard from '../components/DeviceCard'
import BandwidthChart from '../components/BandwidthChart'
import ConfigDelivery from '../components/ConfigDelivery'
import ProtectionStatus from '../components/ProtectionStatus'
import { toast } from '../lib/toast'
import { Plus, MonitorSmartphone, X, Lock, Clock, RotateCcw, Loader2 } from 'lucide-react'

const PLAN_LIMITS = { free: 0, pro: 2 }

export default function Dashboard() {
  const user = useSelector(selectUser)
  const { data: devicesData, isLoading: devicesLoading, isError: devicesError, refetch: refetchDevices } = useListDevicesQuery()
  const { data: serversData, isLoading: serversLoading, isError: serversError } = useListServersQuery()
  const [addDevice, { isLoading: adding }] = useAddDeviceMutation()
  const [requestReactivation, { isLoading: requestingReactivation }] = useRequestReactivationMutation()

  const [showAdd, setShowAdd] = useState(false)
  const [step, setStep] = useState('form') // form | delivery
  const [deviceName, setDeviceName] = useState('')
  const [serverNode, setServerNode] = useState('auto')
  const [mode, setMode] = useState('stealth')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const devices = devicesData?.devices || []
  const servers = serversData?.servers || []
  const limit = PLAN_LIMITS[user?.plan] || 0
  const activeDevices = devices.filter((d) => d.isActive).length
  const serversOnline = servers.filter((s) => s.isOnline).length

  const isApproved = user?.role === 'admin' || !!user?.isApproved
  const daysLeft = user?.planExpiresAt
    ? Math.max(0, Math.ceil((new Date(user.planExpiresAt) - new Date()) / 86400000))
    : 0
  const isExpired = user?.planExpiresAt && new Date(user.planExpiresAt) < new Date()
  const renewingSoon = user?.plan !== 'free' && daysLeft <= 3
  const hasActivePlan = isApproved && user?.plan === 'pro' && daysLeft > 0
  const canAddEntitledDevice = hasActivePlan && activeDevices < limit

  const handleRequestReactivation = async () => {
    try {
      await requestReactivation().unwrap()
      toast.success('Reactivation requested! Waiting for administrator to renew your access.')
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to request reactivation')
    }
  }

  const handleAddDeviceSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!canAddEntitledDevice) {
      if (!isApproved) {
        setError('Account pending administrator approval. Key generation is locked.')
        return
      }
      if (isExpired || user?.plan === 'free') {
        setError('Monthly cycle expired. Please request reactivation.')
        return
      }
      if (activeDevices >= limit) {
        setError(`Maximum device limit reached (${limit}/${limit}). Please remove an existing device.`)
        return
      }
    }

    try {
      const res = await addDevice({ deviceName, serverNode, mode }).unwrap()
      setResult(res)
      setStep('delivery')
    } catch (err) {
      setError(err.data?.error || 'Failed to add device')
    }
  }

  const stats = [
    {
      label: 'Active devices',
      value: activeDevices,
      sub: `${limit} allowed (max 2 devices)`,
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
      label: 'Monthly cycle',
      value: hasActivePlan ? `${daysLeft}d` : !isApproved ? 'pending' : 'expired',
      sub: hasActivePlan ? '100 Mbps max · Pro' : !isApproved ? 'admin approval required' : 'reactivation needed',
      warn: !hasActivePlan || renewingSoon,
    },
  ]

  return (
    <div className="space-y-8">
      <ProtectionStatus devices={devices} plan={user?.plan} daysLeft={daysLeft} />

      {!isApproved && (
        <div className="card border border-warn/40 bg-warn/5 p-6 rounded-2xl animate-fade-up">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-warn/15 text-warn flex items-center justify-center shrink-0 mt-0.5">
                <Lock size={20} />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-ink">Account Pending Administrator Approval</h3>
                <p className="text-sm text-muted mt-1 max-w-xl">
                  StealthVPN is an exclusive private network for friends. Your account has been registered and is currently waiting for administrator approval. Once accepted, you will receive full access to the Pro tier (up to 2 devices, 100 Mbps max speed) for free.
                </p>
              </div>
            </div>
            <span className="chip-warn shrink-0 self-start sm:self-center font-mono text-xs">APPROVAL PENDING</span>
          </div>
        </div>
      )}

      {isApproved && (isExpired || user?.plan === 'free') && (
        <div className="card border border-warn/40 bg-warn/5 p-6 rounded-2xl animate-fade-up">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-warn/15 text-warn flex items-center justify-center shrink-0 mt-0.5">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-ink">Monthly 30-Day Access Expired</h3>
                <p className="text-sm text-muted mt-1 max-w-xl">
                  Your Pro plan access has completed its 30-day monthly cycle. Please request reactivation to continue using the VPN and generating keys.
                </p>
              </div>
            </div>
            <div>
              {user?.reactivationRequested ? (
                <span className="chip-warn font-mono text-xs py-1.5 px-3">REACTIVATION REQUESTED</span>
              ) : (
                <button
                  onClick={handleRequestReactivation}
                  disabled={requestingReactivation}
                  className="btn-primary !bg-accent-400 hover:!bg-accent-300 !text-void font-semibold text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {requestingReactivation ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  <span>Request Reactivation</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink tracking-tight">Your devices</h2>
          <p className="text-sm text-faint mt-0.5">
            {activeDevices} of {limit} used on your {(user?.plan || 'free').toUpperCase()} plan
          </p>
        </div>
        <button
          onClick={() => {
            if (!hasActivePlan || activeDevices >= limit) return
            setShowAdd(true)
            setStep('form')
            setError(null)
          }}
          disabled={!hasActivePlan || activeDevices >= limit}
          className="btn-primary text-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            !isApproved
              ? 'Account pending administrator approval'
              : isExpired || user?.plan === 'free'
                ? 'Monthly cycle expired. Please reactivate.'
                : activeDevices >= limit
                  ? `Device limit reached (${limit}/${limit})`
                  : 'Add device'
          }
        >
          <Plus size={16} />
          {!isApproved
            ? 'Pending Approval'
            : isExpired || user?.plan === 'free'
              ? 'Reactivation Required'
              : activeDevices >= limit
                ? 'Limit Reached (2/2)'
                : 'Add device'}
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
            {!isApproved
              ? 'Your account is waiting for admin approval before you can add devices.'
              : isExpired || user?.plan === 'free'
                ? 'Your monthly cycle has expired. Request reactivation above to generate keys.'
                : 'Add your device to generate WireGuard, Hiddify, Sing-Box, and Clash configs.'}
          </p>
          {canAddEntitledDevice && (
            <button
              onClick={() => {
                setShowAdd(true)
                setStep('form')
                setError(null)
              }}
              className="btn-primary text-sm inline-flex items-center gap-1.5"
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
                    <div>
                      <h2 className="font-display text-xl font-semibold text-ink tracking-tight">Add device</h2>
                      <p className="text-xs text-faint mt-0.5">
                        Pro Access · 100 Mbps Max Speed ({activeDevices}/{limit} devices used)
                      </p>
                    </div>
                    <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg text-faint hover:text-ink hover:bg-raised transition-colors duration-fast" aria-label="Close">
                      <X size={18} />
                    </button>
                  </div>
                  {error && (
                    <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 mb-4 animate-fade-in">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleAddDeviceSubmit} className="space-y-4">
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
                        <option value="auto">Auto (recommended — closest / least loaded)</option>
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
                        <option value="stealth">Stealth (cloaked HTTPS / Reality — bypasses DPI)</option>
                        <option value="gaming">Gaming (raw WireGuard UDP — lowest latency)</option>
                      </select>
                    </div>
                    <button type="submit" disabled={adding} className="btn-primary w-full disabled:opacity-50 mt-2">
                      {adding ? 'Generating secure VPN keys…' : 'Add Device & Generate Keys'}
                    </button>
                  </form>
                </>
              )}

              {step === 'delivery' && result && (
                <ConfigDelivery
                  config={result.config}
                  qrDataUrl={result.qrDataUrl}
                  vlessUri={result.vlessUri}
                  vlessQrDataUrl={result.vlessQrDataUrl}
                  deviceName={result.device?.deviceName || deviceName || 'Device'}
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
