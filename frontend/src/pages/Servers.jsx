import { useState, useEffect } from 'react'
import { RefreshCw, Radar, Zap, Activity, Gauge, Globe2, Sparkles } from 'lucide-react'
import { useListServersQuery, useLazyPingServersQuery } from '../features/devices/serverApi'
import ServerStatus from '../components/ServerStatus'

export default function Servers() {
  const { data, isLoading, isError, refetch, isFetching } = useListServersQuery()
  const [triggerPingAll, { isFetching: pingingAll }] = useLazyPingServersQuery()
  const [pings, setPings] = useState({})

  const handlePingAll = async () => {
    try {
      const res = await triggerPingAll(undefined, true).unwrap()
      if (res?.pings) {
        const pingMap = {}
        res.pings.forEach((p) => {
          if (p.latencyMs !== null) {
            pingMap[p.name] = p.latencyMs
          }
        })
        setPings(pingMap)
      }
    } catch {
      // Ignore background ping errors
    }
  }

  useEffect(() => {
    if (data?.servers?.length) {
      handlePingAll()
    }
  }, [data])

  const servers = data?.servers || []
  const onlineCount = servers.filter((s) => s.isOnline).length

  // Determine fastest node
  let fastestNodeName = null
  let minPing = Infinity
  Object.entries(pings).forEach(([name, latency]) => {
    if (latency !== null && latency < minPing) {
      minPing = latency
      fastestNodeName = name
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Server nodes</h1>
          <p className="text-sm text-muted mt-1">
            Global high-speed edge nodes with WireGuard + XTLS-Reality vision flow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePingAll}
            disabled={pingingAll || isLoading}
            className="btn-secondary text-sm shrink-0 flex items-center gap-2"
          >
            <Gauge size={14} className={pingingAll ? 'animate-spin text-accent-400' : 'text-accent-400'} />
            {pingingAll ? 'Measuring...' : 'Test all latencies'}
          </button>
          <button onClick={refetch} className="btn-secondary text-sm shrink-0" disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Network Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ok/10 border border-ok/20 flex items-center justify-center text-ok shrink-0">
            <Globe2 size={20} />
          </div>
          <div>
            <div className="text-xs text-faint">Active Edge Nodes</div>
            <div className="text-lg font-bold font-mono text-ink">
              {onlineCount} <span className="text-xs text-faint font-normal">/ {servers.length} online</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-400/10 border border-accent-400/20 flex items-center justify-center text-accent-400 shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <div className="text-xs text-faint">Lowest Latency</div>
            <div className="text-lg font-bold font-mono text-ink">
              {minPing !== Infinity ? `${minPing} ms` : '—'}{' '}
              {fastestNodeName && <span className="text-xs text-accent-400 capitalize">({fastestNodeName})</span>}
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-raised border border-line flex items-center justify-center text-ink shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <div className="text-xs text-faint">Protocols Supported</div>
            <div className="text-sm font-semibold font-mono text-ink mt-0.5">
              WireGuard · VLESS-Vision
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => <div key={i} className="skeleton h-[84px] rounded-xl" />)}
        </div>
      )}

      {isError && (
        <div className="card border-danger/30 text-center py-8 animate-fade-in">
          <p className="text-danger">Failed to load servers.</p>
          <button onClick={refetch} className="btn-secondary text-sm mt-4">Retry</button>
        </div>
      )}

      {data && (
        data.servers.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.servers.map((s, i) => (
              <div key={s.name} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 5) * 80}ms` }}>
                <ServerStatus
                  server={s}
                  isFastest={s.name === fastestNodeName}
                  initialPing={pings[s.name] || null}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center py-10 animate-fade-in">
            <Radar size={22} className="text-faint mx-auto mb-3" strokeWidth={1.75} />
            <p className="text-sm text-muted">No server nodes configured yet.</p>
            <p className="text-xs text-faint mt-1">
              Nodes appear here once an operator registers them on the control plane.
            </p>
          </div>
        )
      )}

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">Which mode should I use?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-void/50 border border-line p-4">
            <div className="flex items-center gap-2 mb-2">
              <Radar size={16} className="text-accent-400" />
              <span className="font-semibold text-accent-300 text-sm">Stealth</span>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              For restricted networks — university, office, or censored regions. Traffic is
              indistinguishable from HTTPS to microsoft.com.
            </p>
          </div>
          <div className="rounded-lg bg-void/50 border border-line p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-warn" />
              <span className="font-semibold text-warn text-sm">Gaming</span>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              For open home networks. Pure WireGuard UDP with only +2–4ms of overhead.
            </p>
          </div>
        </div>
        <p className="text-xs text-faint mt-4">
          Mode is chosen manually per device in the dashboard — use Gaming on open home networks
          and Stealth on restricted ones. There is no automatic fallback between modes.
        </p>
      </div>
    </div>
  )
}
