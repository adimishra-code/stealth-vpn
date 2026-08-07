import { useState } from 'react'
import PropTypes from 'prop-types'
import {
  useListUsersQuery,
  useUpdateUserMutation,
  useGetRevenueQuery,
  useGetAdminBandwidthQuery,
  useGetAlertsQuery,
  useGetPoolStatusQuery,
  useGetAuditLogsQuery,
  useListDevicesQuery,
  useExpireDeviceMutation,
  useRevokeDeviceMutation,
  useBanUserMutation,
  useResetBandwidthMutation,
} from '../features/admin/adminApi'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ExtendModal from '../components/admin/ExtendModal'
import ConfirmModal from '../components/ConfirmModal'
import { toast } from '../lib/toast'
import useDebounce from '../hooks/useDebounce'
import { Ban, ShieldCheck, Search, ChevronLeft, ChevronRight, ServerCrash, AlertTriangle, Clock3, Power, ShieldOff, CalendarPlus, RotateCcw, Loader2 } from 'lucide-react'

const baseActionBtn = 'p-1.5 rounded-md text-faint hover:text-ink hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.98]'
const dangerActionBtn = 'p-1.5 rounded-md text-faint hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.98]'

// Icon-only table action with a CSS tooltip on hover.
function ActionButton({ label, onClick, disabled, loading, danger, children }) {
  return (
    <div className="relative group/action">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className={`${danger ? dangerActionBtn : baseActionBtn} disabled:pointer-events-none disabled:opacity-60`}
        aria-label={label}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : children}
      </button>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-ink bg-surface border border-line-strong rounded-md whitespace-nowrap opacity-0 group-hover/action:opacity-100 pointer-events-none transition-opacity duration-150 shadow-[var(--shadow-card)]">
        {label}
      </span>
    </div>
  )
}

ActionButton.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  danger: PropTypes.bool,
  children: PropTypes.node.isRequired,
}

export default function Admin() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [planFilter, setPlanFilter] = useState('')
  const [userError, setUserError] = useState(null)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [devicePage, setDevicePage] = useState(1)
  const [loadingId, setLoadingId] = useState(null)
  const [extendTarget, setExtendTarget] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Search inputs update on every keystroke, but the backend queries only fire
  // after the input settles for 300ms.
  const debouncedSearch = useDebounce(search, 300)
  const debouncedDeviceSearch = useDebounce(deviceSearch, 300)

  const { data: usersData, isFetching: usersLoading, isError: usersError, refetch: refetchUsers } = useListUsersQuery({ search: debouncedSearch, plan: planFilter, page, limit: 10 })
  const { data: revenueData, isError: revenueError } = useGetRevenueQuery()
  const { data: bandwidthData, isError: bandwidthError } = useGetAdminBandwidthQuery()
  const { data: alertsData, isError: alertsError } = useGetAlertsQuery()
  const { data: poolData, isError: poolError } = useGetPoolStatusQuery()
  const { data: auditData, isError: auditError } = useGetAuditLogsQuery({ limit: 25 })
  const { data: devicesData, isFetching: devicesLoading, isError: devicesError, refetch: refetchDevices } = useListDevicesQuery({ search: debouncedDeviceSearch, page: devicePage, limit: 10 })
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation()
  const [expireDevice] = useExpireDeviceMutation()
  const [revokeDevice] = useRevokeDeviceMutation()
  const [banUser, { isLoading: banning }] = useBanUserMutation()
  const [resetBandwidth] = useResetBandwidthMutation()

  const users = usersData?.users || []
  const pagination = usersData?.pagination
  const devices = devicesData?.devices || []
  const devicePagination = devicesData?.pagination
  const inrDaily = (revenueData?.daily || []).filter((r) => r.currency === 'INR')

  const handleUpdate = async (id, changes) => {
    setUserError(null)
    try {
      await updateUser({ id, ...changes }).unwrap()
    } catch (err) {
      setUserError(err.data?.error || 'Update failed')
    }
  }

  const handleExpire = (deviceId, deviceName) => {
    setConfirmAction({
      title: 'Force-expire device?',
      message: (
        <>
          Immediately revoke <span className="font-medium text-ink">{deviceName}</span>&apos;s WireGuard peer and Xray user?
        </>
      ),
      confirmLabel: 'Force expire',
      danger: true,
      run: async () => {
        setLoadingId(deviceId)
        try {
          await expireDevice(deviceId).unwrap()
          toast.success(`${deviceName} expired`)
        } catch (err) {
          toast.error(err?.data?.error ?? 'Failed to expire device')
        } finally {
          setLoadingId(null)
        }
      },
    })
  }

  const handleRevoke = (deviceId, deviceName) => {
    setConfirmAction({
      title: 'Permanently revoke device?',
      message: (
        <>
          Revoke <span className="font-medium text-ink">{deviceName}</span>? This cannot be undone.
        </>
      ),
      confirmLabel: 'Revoke',
      danger: true,
      run: async () => {
        setLoadingId(deviceId)
        try {
          await revokeDevice(deviceId).unwrap()
          toast.success(`${deviceName} revoked`)
        } catch (err) {
          toast.error(err?.data?.error ?? 'Failed to revoke device')
        } finally {
          setLoadingId(null)
        }
      },
    })
  }

  const handleBan = (userId, userName) => {
    setConfirmAction({
      title: 'Ban user?',
      message: (
        <>
          Ban <span className="font-medium text-ink">{userName}</span>? All their devices will be revoked immediately.
        </>
      ),
      confirmLabel: 'Ban user',
      danger: true,
      run: async () => {
        try {
          await banUser({ userId, banReason: 'Banned by admin' }).unwrap()
          toast.success(`${userName} banned — all devices revoked`)
        } catch (err) {
          toast.error(err?.data?.error ?? 'Failed to ban user')
        }
      },
    })
  }

  const handleUnban = async (userId, userName) => {
    setUserError(null)
    try {
      await updateUser({ id: userId, isActive: true }).unwrap()
      toast.success(`${userName} unbanned`)
    } catch (err) {
      setUserError(err.data?.error || 'Unban failed')
    }
  }

  const handleResetBandwidth = (deviceId, deviceName) => {
    setConfirmAction({
      title: 'Reset bandwidth?',
      message: (
        <>
          Reset bandwidth for <span className="font-medium text-ink">{deviceName}</span>? This clears all snapshot data for the current period.
        </>
      ),
      confirmLabel: 'Reset',
      danger: true,
      run: async () => {
        setLoadingId(deviceId)
        try {
          await resetBandwidth(deviceId).unwrap()
          toast.success(`Bandwidth reset for ${deviceName}`)
        } catch (err) {
          toast.error(err?.data?.error ?? 'Failed to reset bandwidth')
        } finally {
          setLoadingId(null)
        }
      },
    })
  }

  const handleConfirm = async () => {
    setConfirmLoading(true)
    try {
      await confirmAction.run()
    } finally {
      setConfirmLoading(false)
      setConfirmAction(null)
    }
  }

  const handleExtend = (deviceId, deviceName) => {
    setExtendTarget({ deviceId, deviceName })
  }

  const alerts = [
    alertsData?.offlineNodes?.length > 0 && {
      tone: 'danger',
      Icon: ServerCrash,
      title: 'Offline nodes',
      detail: alertsData.offlineNodes.map((n) => n.name).join(', '),
      count: alertsData.offlineNodes.length,
    },
    alertsData?.failedPayments?.length > 0 && {
      tone: 'warn',
      Icon: AlertTriangle,
      title: 'Failed payments',
      detail: `${alertsData.failedPayments.length} recent failed payment${alertsData.failedPayments.length > 1 ? 's' : ''}`,
      count: alertsData.failedPayments.length,
    },
    alertsData?.expiredUsers?.length > 0 && {
      tone: 'muted',
      Icon: Clock3,
      title: 'Past expiry',
      detail: `${alertsData.expiredUsers.length} user${alertsData.expiredUsers.length > 1 ? 's' : ''} past expiry`,
      count: alertsData.expiredUsers.length,
    },
  ].filter(Boolean)

  const alertTones = {
    danger: 'border-l-danger text-danger',
    warn: 'border-l-warn text-warn',
    muted: 'border-l-line-strong text-muted',
  }

  const userStatusChip = (u) => u.isActive ? 'chip-ok' : 'chip-danger'

  const deviceStatusChip = (d) => {
    const st = d.status || (d.isActive ? 'active' : 'revoked')
    return st === 'active' ? 'chip-ok' : st === 'expired' ? 'chip-warn' : 'chip-danger'
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink tracking-tight animate-fade-up">Admin panel</h1>

      {userError && (
        <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 animate-fade-in">
          {userError}
        </div>
      )}

      {(revenueError || bandwidthError || alertsError || poolError) && (
        <div className="border border-danger/30 bg-danger/10 text-danger text-sm rounded-lg p-3 animate-fade-in">
          Some admin stats failed to load. Refresh the page to retry.
        </div>
      )}

      {/* Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card animate-fade-up">
          <h2 className="font-display text-lg font-semibold text-ink mb-1">Revenue (last 30 days)</h2>
          <p className="text-xs text-faint mb-4">
            {revenueData?.last30Days?.length
              ? revenueData.last30Days
                  .map((r) => `${r.currency === 'USD' ? '$' : '₹'}${(r.total / 100).toFixed(2)} from ${r.count} payments`)
                  .join(' · ')
              : 'No payments yet'}
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inrDaily.slice(-14)} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(40,40,45,0.4)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#5d5d66', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#5d5d66', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(45,212,191,0.06)' }}
                  contentStyle={{
                    background: '#1d1d20',
                    border: '1px solid #38383f',
                    borderRadius: 8,
                    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.45), 0 10px 30px -14px rgba(0,0,0,0.7)',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 12,
                    color: '#f4f4f5',
                  }}
                  labelStyle={{ color: '#8f8f98' }}
                  itemStyle={{ color: '#2dd4bf' }}
                />
                <Bar dataKey="total" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card animate-fade-up" style={{ animationDelay: '40ms' }}>
            <h2 className="font-display text-lg font-semibold text-ink mb-3">IP pool</h2>
            {poolData ? (
              <>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-mono text-sm text-ink">
                    {poolData.allocated}<span className="text-faint">/{poolData.total}</span>
                  </span>
                  <span className={`font-mono text-sm ${poolData.pct >= 80 ? 'text-danger' : poolData.pct >= 50 ? 'text-warn' : 'text-faint'}`}>
                    {poolData.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${poolData.pct >= 80 ? 'bg-danger' : poolData.pct >= 50 ? 'bg-warn' : 'bg-accent-400'}`}
                    style={{ width: `${Math.min(poolData.pct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-faint mt-2">
                  {poolData.free} free{poolData.perNode?.length ? ` across ${poolData.perNode.length} node${poolData.perNode.length > 1 ? 's' : ''}` : ''} · 80%+ means add capacity
                </p>
              </>
            ) : (
              <p className="text-sm text-faint">No data yet</p>
            )}
          </div>

          <div className="card animate-fade-up" style={{ animationDelay: '80ms' }}>
            <h2 className="font-display text-lg font-semibold text-ink mb-3">Bandwidth per node</h2>
            {(bandwidthData?.perNode || []).map((n) => (
              <div key={n._id} className="flex items-center justify-between py-2.5 border-b border-line/60 last:border-0">
                <span className="text-sm text-muted capitalize">{n._id}</span>
                <span className="font-mono text-sm text-ink">{(n.totalMB / 1024).toFixed(1)} GB <span className="text-faint">({n.active} active)</span></span>
              </div>
            ))}
            {(!bandwidthData?.perNode || bandwidthData.perNode.length === 0) && (
              <p className="text-sm text-faint">No data yet</p>
            )}
          </div>

          <div className="card animate-fade-up" style={{ animationDelay: '160ms' }}>
            <h2 className="font-display text-lg font-semibold text-ink mb-3">Alerts</h2>
            <div className="space-y-2.5 text-sm">
              {alerts.map(({ tone, Icon, title, detail, count }) => (
                <div key={title} className={`flex items-start gap-3 border-l-2 bg-void/40 border-l-[3px] rounded-r-lg px-3.5 py-2.5 ${alertTones[tone]}`}>
                  <Icon size={16} className="shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium flex items-center gap-2 text-ink">
                      {title}
                      <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent-400 text-void font-mono text-[11px] font-semibold">
                        {count}
                      </span>
                    </p>
                    <p className="text-xs text-faint mt-0.5">{detail}</p>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-muted flex items-center gap-2">
                  <ShieldCheck size={15} className="text-ok" />
                  All clear
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Users */}
      <div className="card animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Users</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input
              className="input !w-64 !py-1.5 !pl-8 text-sm"
              placeholder="Search email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select
            className="input !w-36 !py-1.5 text-sm"
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1) }}
          >
            <option value="">All plans</option>
            <option value="free">free</option>
            <option value="basic">basic</option>
            <option value="pro">pro</option>
            <option value="team">team</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-faint border-b border-line">
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Email</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Plan</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Expires</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Status</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Joined</th>
                <th className="pb-3 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-line/60 last:border-0 transition-colors duration-fast hover:bg-raised/50">
                  <td className="py-3.5 pr-4 text-ink">{u.email}</td>
                  <td className="py-3.5 pr-4 font-mono uppercase text-muted">{u.plan}</td>
                  <td className="py-3.5 pr-4 text-faint font-mono">
                    {u.planExpiresAt ? new Date(u.planExpiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className={userStatusChip(u)}>{u.isActive ? 'ACTIVE' : 'BANNED'}</span>
                  </td>
                  <td className="py-3.5 pr-4 text-faint">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3.5">
                    <div className="flex items-center gap-2">
                      {/* Icon action with tooltip */}
                      <button
                        onClick={() => (u.isActive ? handleBan(u._id, u.email) : handleUnban(u._id, u.email))}
                        disabled={banning || updating}
                        className={`group relative flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-fast disabled:opacity-50 ${
                          u.isActive
                            ? 'border-danger/30 text-danger hover:bg-danger/10'
                            : 'border-line text-muted hover:bg-raised hover:text-ok hover:border-ok/40'
                        }`}
                        aria-label={u.isActive ? `Ban ${u.email}` : `Unban ${u.email}`}
                      >
                        {banning ? <Loader2 size={14} className="animate-spin" /> : u.isActive ? <Ban size={14} /> : <ShieldCheck size={14} />}
                        <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-raised border border-line px-2 py-1 text-[11px] text-ink shadow-tooltip opacity-0 translate-x-1 transition-all duration-fast group-hover:opacity-100 group-hover:translate-x-0">
                          {u.isActive ? 'Ban User' : 'Unban'}
                        </span>
                      </button>
                      <select
                        className="input !w-24 !py-1 !px-2 text-xs font-mono"
                        value={u.plan}
                        onChange={(e) => handleUpdate(u._id, { plan: e.target.value })}
                        disabled={updating}
                        aria-label={`Change plan for ${u.email}`}
                      >
                        <option value="free">free</option>
                        <option value="basic">basic</option>
                        <option value="pro">pro</option>
                        <option value="team">team</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {usersError ? (
          <div className="flex items-center justify-between gap-4 py-3">
            <p className="text-sm text-danger">Failed to load users.</p>
            <button onClick={refetchUsers} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0">Retry</button>
          </div>
        ) : (
          <>
            {usersLoading && (
              <div className="space-y-2 mt-4">
                {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
              </div>
            )}

            {!usersLoading && users.length === 0 && (
              <p className="text-sm text-faint mt-4">No users found.</p>
            )}

            {pagination && pagination.pages > 1 && (
          <div className="flex items-center gap-1.5 mt-4">
            <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="btn-secondary !py-1 !px-2 text-xs disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-7 h-7 rounded-md font-mono text-xs transition-all duration-fast ${
                  n === pagination.page
                    ? 'bg-accent-400 text-void font-semibold shadow-glow-accent'
                    : 'text-muted hover:bg-raised hover:text-ink'
                }`}
                aria-label={`Page ${n}`}
                aria-current={n === pagination.page ? 'page' : undefined}
              >
                {n}
              </button>
            ))}
            <button onClick={() => setPage(page + 1)} disabled={page >= pagination.pages} className="btn-secondary !py-1 !px-2 text-xs disabled:opacity-40" aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* Devices */}
      <div className="card animate-fade-up" style={{ animationDelay: '320ms' }}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Devices</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input
              className="input !w-64 !py-1.5 !pl-8 text-sm"
              placeholder="Search device or IP..."
              value={deviceSearch}
              onChange={(e) => { setDeviceSearch(e.target.value); setDevicePage(1) }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-faint border-b border-line">
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Device</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">User</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Node</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">IP</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Status</th>
                <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Bandwidth</th>
                <th className="pb-3 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d._id} className="border-b border-line/60 last:border-0 transition-colors duration-fast hover:bg-raised/50">
                  <td className="py-3.5 pr-4">
                    <div className="font-medium text-ink">{d.deviceName}</div>
                    <div className="font-mono text-xs text-faint mt-0.5">{d.platform}</div>
                  </td>
                  <td className="py-3.5 pr-4 text-muted">{d.userId?.email || '—'}</td>
                  <td className="py-3.5 pr-4 font-mono uppercase text-muted">{d.serverNode || '—'}</td>
                  <td className="py-3.5 pr-4 font-mono text-faint">{d.assignedIP || '—'}</td>
                  <td className="py-3.5 pr-4">
                    <span className={`chip ${deviceStatusChip(d)}`}>
                      {(d.status || (d.isActive ? 'active' : 'revoked')).toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4 font-mono text-faint">{(d.bandwidthUsedMB / 1024).toFixed(2)} GB</td>
                  <td className="py-3.5">
                    <div className="flex items-center gap-1">
                      <ActionButton
                        label="Force Expire"
                        onClick={() => handleExpire(d._id, d.deviceName)}
                        disabled={!d.isActive}
                        loading={loadingId === d._id}
                      >
                        <Power size={14} />
                      </ActionButton>
                      <ActionButton
                        label="Revoke"
                        danger
                        onClick={() => handleRevoke(d._id, d.deviceName)}
                        disabled={!d.isActive}
                        loading={loadingId === d._id}
                      >
                        <ShieldOff size={14} />
                      </ActionButton>
                      <ActionButton
                        label="Extend"
                        onClick={() => handleExtend(d._id, d.deviceName)}
                        disabled={loadingId === d._id}
                      >
                        <CalendarPlus size={14} />
                      </ActionButton>
                      <ActionButton
                        label="Reset BW"
                        onClick={() => handleResetBandwidth(d._id, d.deviceName)}
                        disabled={loadingId === d._id}
                      >
                        <RotateCcw size={14} />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {devicesError ? (
          <div className="flex items-center justify-between gap-4 py-3">
            <p className="text-sm text-danger">Failed to load devices.</p>
            <button onClick={refetchDevices} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0">Retry</button>
          </div>
        ) : (
          <>
            {devicesLoading && (
              <div className="space-y-2 mt-4">
                {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
              </div>
            )}

            {!devicesLoading && devices.length === 0 && (
              <p className="text-sm text-faint mt-4">No devices found.</p>
            )}

            {devicePagination && devicePagination.pages > 1 && (
          <div className="flex items-center gap-1.5 mt-4">
            <button onClick={() => setDevicePage(devicePage - 1)} disabled={devicePage <= 1} className="btn-secondary !py-1 !px-2 text-xs disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: devicePagination.pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setDevicePage(n)}
                className={`w-7 h-7 rounded-md font-mono text-xs transition-all duration-fast ${
                  n === devicePagination.page
                    ? 'bg-accent-400 text-void font-semibold shadow-glow-accent'
                    : 'text-muted hover:bg-raised hover:text-ink'
                }`}
                aria-label={`Page ${n}`}
                aria-current={n === devicePagination.page ? 'page' : undefined}
              >
                {n}
              </button>
            ))}
            <button onClick={() => setDevicePage(devicePage + 1)} disabled={devicePage >= devicePagination.pages} className="btn-secondary !py-1 !px-2 text-xs disabled:opacity-40" aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* Audit log */}
      <div className="card animate-fade-up">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Audit log</h2>
          <span className="text-xs text-faint">Admin actions · 90-day retention</span>
        </div>
        {auditError && (
          <p className="text-sm text-danger">Failed to load audit log.</p>
        )}
        {auditData && auditData.logs.length === 0 && (
          <p className="text-sm text-faint">No admin actions recorded yet.</p>
        )}
        {(auditData?.logs || []).length > 0 && (
          <div className="space-y-1.5">
            {(auditData.logs || []).map((log) => (
              <div key={log.id} className="flex items-start gap-3 py-2 border-b border-line/60 last:border-0">
                <span className="font-mono text-xs text-accent-300 bg-accent-400/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                  {log.action}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted truncate">
                    {log.adminEmail || 'unknown'} → {log.targetType}
                    <span className="font-mono text-faint"> #{log.targetId ? String(log.targetId).slice(-8) : '-'}</span>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span className="text-faint"> · {Object.entries(log.details).map(([k, v]) => `${k}=${String(v).slice(0, 24)}`).join(', ')}</span>
                    )}
                  </p>
                  <p className="text-xs text-faint font-mono">
                    {new Date(log.createdAt).toLocaleString()} · {log.ip || 'unknown ip'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {extendTarget && (
        <ExtendModal
          deviceId={extendTarget.deviceId}
          deviceName={extendTarget.deviceName}
          onClose={() => setExtendTarget(null)}
        />
      )}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          danger={confirmAction.danger}
          loading={confirmLoading}
          onConfirm={handleConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
