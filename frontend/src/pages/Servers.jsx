import { RefreshCw, Radar, Zap } from 'lucide-react'
import { useListServersQuery } from '../features/devices/serverApi'
import ServerStatus from '../components/ServerStatus'

export default function Servers() {
  const { data, isLoading, isError, refetch, isFetching } = useListServersQuery()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Server nodes</h1>
          <p className="text-sm text-muted mt-1">
            All nodes run WireGuard + XTLS-Reality. Pick your nearest exit.
          </p>
        </div>
        <button onClick={refetch} className="btn-secondary text-sm shrink-0" disabled={isFetching}>
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
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
                <ServerStatus server={s} />
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
