import { useState } from 'react'
import {
  useListUsersQuery,
  useUpdateUserMutation,
  useGetRevenueQuery,
  useGetAdminBandwidthQuery,
  useGetAlertsQuery,
} from '../features/admin/adminApi'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export default function Admin() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [planFilter, setPlanFilter] = useState('')
  const [userError, setUserError] = useState(null)

  const { data: usersData, isFetching: usersLoading } = useListUsersQuery({ search, plan: planFilter, page, limit: 10 })
  const { data: revenueData } = useGetRevenueQuery()
  const { data: bandwidthData } = useGetAdminBandwidthQuery()
  const { data: alertsData } = useGetAlertsQuery()
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation()

  const users = usersData?.users || []
  const pagination = usersData?.pagination
  const inrDaily = (revenueData?.daily || []).filter((r) => r.currency === 'INR')

  const handleUpdate = async (id, changes) => {
    setUserError(null)
    try {
      await updateUser({ id, ...changes }).unwrap()
    } catch (err) {
      setUserError(err.data?.error || 'Update failed')
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Admin panel</h1>

      {userError && (
        <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400 text-sm rounded-lg p-3">
          {userError}
        </div>
      )}

      {/* Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-bold text-white mb-1">Revenue (last 30 days)</h2>
          <p className="text-xs text-slate-500 mb-4">
            {revenueData?.last30Days?.length
              ? revenueData.last30Days
                  .map((r) => `${r.currency === 'USD' ? '$' : '₹'}${(r.total / 100).toFixed(2)} from ${r.count} payments`)
                  .join(' · ')
              : 'No payments yet'}
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inrDaily.slice(-14)} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2145" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0a0e27', border: '1px solid #1a2145', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="font-bold text-white mb-3">Bandwidth per node</h2>
            {(bandwidthData?.perNode || []).map((n) => (
              <div key={n._id} className="flex items-center justify-between py-2 border-b border-stealth-700/40 last:border-0">
                <span className="text-sm text-slate-300 capitalize">{n._id}</span>
                <span className="text-sm text-white">{(n.totalMB / 1024).toFixed(1)} GB <span className="text-slate-500">({n.active} active)</span></span>
              </div>
            ))}
            {(!bandwidthData?.perNode || bandwidthData.perNode.length === 0) && (
              <p className="text-sm text-slate-500">No data yet</p>
            )}
          </div>

          <div className="card">
            <h2 className="font-bold text-white mb-3">Alerts</h2>
            <div className="space-y-3 text-sm">
              {alertsData?.offlineNodes?.length > 0 && (
                <div className="text-rose-400">
                  ⚠ Offline nodes: {alertsData.offlineNodes.map((n) => n.name).join(', ')}
                </div>
              )}
              {alertsData?.failedPayments?.length > 0 && (
                <div className="text-amber-400">
                  ⚠ {alertsData.failedPayments.length} recent failed payment{alertsData.failedPayments.length > 1 ? 's' : ''}
                </div>
              )}
              {alertsData?.expiredUsers?.length > 0 && (
                <div className="text-sky-400">
                  ℹ {alertsData.expiredUsers.length} user{alertsData.expiredUsers.length > 1 ? 's' : ''} past expiry
                </div>
              )}
              {(!alertsData || (alertsData.offlineNodes?.length === 0 && alertsData.failedPayments?.length === 0 && alertsData.expiredUsers?.length === 0)) && (
                <p className="text-slate-500">All clear ✨</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Users */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-bold text-white">Users</h2>
          <input
            className="input !w-64 !py-1.5 text-sm"
            placeholder="Search email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
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
              <tr className="text-left text-slate-500 border-b border-stealth-700">
                <th className="pb-3 pr-4 font-medium">Email</th>
                <th className="pb-3 pr-4 font-medium">Plan</th>
                <th className="pb-3 pr-4 font-medium">Expires</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Joined</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-stealth-700/40 last:border-0">
                  <td className="py-3 pr-4 text-slate-300">{u.email}</td>
                  <td className="py-3 pr-4 uppercase text-slate-300">{u.plan}</td>
                  <td className="py-3 pr-4 text-slate-400">
                    {u.planExpiresAt ? new Date(u.planExpiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      u.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {u.isActive ? 'ACTIVE' : 'BANNED'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(u._id, { isActive: !u.isActive, banReason: u.isActive ? 'Banned by admin' : undefined })}
                        disabled={updating}
                        className={`${u.isActive ? 'btn-danger' : 'btn-secondary'} !py-1 !px-2.5 text-xs disabled:opacity-50`}
                      >
                        {u.isActive ? 'Ban' : 'Unban'}
                      </button>
                      <select
                        className="input !w-24 !py-1 text-xs"
                        value={u.plan}
                        onChange={(e) => handleUpdate(u._id, { plan: e.target.value })}
                        disabled={updating}
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

        {usersLoading && <p className="text-sm text-slate-500 mt-3">Loading...</p>}

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="btn-secondary !py-1 !px-3 text-xs disabled:opacity-40">
              ← Prev
            </button>
            <span className="text-sm text-slate-400">Page {pagination.page} / {pagination.pages}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= pagination.pages} className="btn-secondary !py-1 !px-3 text-xs disabled:opacity-40">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
