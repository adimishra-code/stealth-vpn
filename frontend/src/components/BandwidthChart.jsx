import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const sampleData = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (29 - i))
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    mb: Math.round((Math.sin(i / 4) + 1.5) * 120 + Math.random() * 200),
  }
})

export default function BandwidthChart() {
  return (
    <div className="card">
      <h3 className="font-semibold text-white mb-1">Bandwidth usage — last 30 days</h3>
      <p className="text-xs text-slate-500 mb-4">Aggregate across your devices (MB / day)</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sampleData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="bandwidthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2145" />
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#0a0e27', border: '1px solid #1a2145', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Area type="monotone" dataKey="mb" stroke="#6366f1" strokeWidth={2} fill="url(#bandwidthGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
