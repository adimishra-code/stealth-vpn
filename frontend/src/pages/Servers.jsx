import { useListServersQuery } from '../features/devices/serverApi'
import ServerStatus from '../components/ServerStatus'

export default function Servers() {
  const { data, isLoading, isError, refetch } = useListServersQuery()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Server nodes</h1>
          <p className="text-sm text-slate-400 mt-1">
            All nodes run WireGuard + XTLS-Reality. Pick your nearest exit.
          </p>
        </div>
        <button onClick={refetch} className="btn-secondary text-sm">
          ↻ Refresh
        </button>
      </div>

      {isLoading && <p className="text-slate-500">Loading servers...</p>}
      {isError && <p className="text-rose-400">Failed to load servers. <button onClick={refetch} className="underline">Retry</button></p>}

      {data && (
        <div className="space-y-3">
          {data.servers.map((s) => (
            <ServerStatus key={s.name} server={s} />
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="font-bold text-white mb-2">Mode selection guide</h2>
        <div className="text-sm text-slate-400 space-y-2">
          <p><span className="text-stealth-400 font-semibold">Stealth</span> — recommended on restricted networks (university, office, China). Traffic looks like HTTPS to microsoft.com.</p>
          <p><span className="text-emerald-400 font-semibold">Gaming</span> — recommended on open home networks. Pure WireGuard UDP, +2–4ms only.</p>
          <p className="text-xs text-slate-500">StealthVPN auto-detects: if raw WireGuard handshake completes in under 500ms, it uses gaming mode automatically.</p>
        </div>
      </div>
    </div>
  )
}
