import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useGetDailyBandwidthQuery } from '../features/devices/serverApi'
import { BarChart2 } from 'lucide-react'

function formatMB(mb) {
  return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`
}

export default function BandwidthChart() {
  const { data, isLoading, isError, refetch, isFetching } = useGetDailyBandwidthQuery({ days: 30 })

  const daily = (data?.daily || []).map((d) => ({
    date: d.date.slice(5), // "YYYY-MM-DD" -> "MM-DD"
    mb: d.totalMB,
    label: formatMB(d.totalMB),
  }))

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink mb-1">Bandwidth (last 30 days)</h3>
          <p className="text-xs text-faint mb-4">Daily usage across your nodes</p>
        </div>
        {daily.length > 0 && (
          <button
            onClick={refetch}
            disabled={isFetching}
            className="btn-secondary !py-1 !px-2.5 text-xs disabled:opacity-40"
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="skeleton h-56" />
        </div>
      )}

      {isError && (
        <div className="text-center py-14">
          <p className="text-danger text-sm">Failed to load bandwidth data.</p>
          <button onClick={refetch} className="btn-secondary text-sm mt-4">Retry</button>
        </div>
      )}

      {data && daily.length === 0 && (
        <div className="text-center py-14 animate-fade-in">
          <BarChart2 size={28} className="text-faint mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-ink font-medium">No data yet</p>
          <p className="text-sm text-faint mt-1">Snapshots are taken daily at midnight — check back after the first one.</p>
        </div>
      )}

      {data && daily.length > 0 && (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 5, right: 5, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="bandwidthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(40,40,45,0.4)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#5d5d66', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: '#5d5d66', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatMB(v)}
              />
              <Tooltip
                cursor={{ stroke: '#2dd4bf', strokeOpacity: 0.35 }}
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
                formatter={(value) => [formatMB(value), 'bandwidth']}
              />
              <Area
                type="monotone"
                dataKey="mb"
                stroke="#2dd4bf"
                strokeWidth={2}
                fill="url(#bandwidthGrad)"
                activeDot={{ r: 4, fill: '#2dd4bf', stroke: '#0a0a0b', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
