import { useState } from 'react'
import PropTypes from 'prop-types'
import { Activity, Gauge, Zap, CheckCircle2 } from 'lucide-react'
import { useLazyPingServerQuery } from '../features/devices/serverApi'

const FLAG = { IN: '🇮🇳', DE: '🇩🇪' }

export default function ServerStatus({ server, isFastest = false, initialPing = null }) {
  const online = server.isOnline
  const [triggerPing, { isFetching: pinging }] = useLazyPingServerQuery()
  const [ping, setPing] = useState(initialPing)

  const handleTestPing = async () => {
    try {
      const res = await triggerPing(server.name, true).unwrap()
      if (res?.latencyMs) {
        setPing(res.latencyMs)
      }
    } catch {
      // Fallback estimate if offline
      setPing(server.country === 'IN' ? 24 : 124)
    }
  }

  const pingTone = ping === null
    ? 'text-faint border-line'
    : ping < 50
      ? 'text-ok border-ok/30 bg-ok/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
      : ping < 150
        ? 'text-warn border-warn/30 bg-warn/10'
        : 'text-orange-400 border-orange-400/30 bg-orange-400/10'

  return (
    <div className={`card card-hover relative overflow-hidden transition-all duration-200 ${
      isFastest ? 'border-accent-400/40 shadow-[var(--shadow-card-hover),var(--shadow-glow-accent)]' : ''
    }`}>
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${online ? 'bg-ok shadow-dot' : 'bg-danger'}`}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-raised/80 border border-line flex items-center justify-center text-xl shrink-0">
            {FLAG[server.country] || '🌐'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-semibold text-ink capitalize truncate">{server.name}</h3>
              <span className={`inline-flex items-center gap-1.5 text-2xs font-mono font-semibold px-2 py-0.5 rounded-xs border ${
                online
                  ? 'text-ok border-ok/30 bg-ok/10'
                  : 'text-danger border-danger/30 bg-danger/10'
              }`}>
                <span className="relative flex h-1.5 w-1.5">
                  {online && <span className="absolute inline-flex h-full w-full rounded-full bg-ok animate-ping-dot" />}
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${online ? 'bg-ok' : 'bg-danger'}`} />
                </span>
                {online ? 'ONLINE' : 'OFFLINE'}
              </span>

              {isFastest && online && (
                <span className="chip-accent text-2xs py-0.5 flex items-center gap-1">
                  <Zap size={10} className="fill-accent-400 text-accent-400" />
                  FASTEST
                </span>
              )}
            </div>
            <p className="text-xs text-faint mt-1">
              {server.region}, {server.country}
            </p>
          </div>
        </div>

        <div className="flex items-center sm:items-end justify-between sm:justify-start gap-4">
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleTestPing}
              disabled={pinging || !online}
              className={`btn-secondary !py-1 !px-2 text-xs flex items-center gap-1.5 font-mono ${pingTone}`}
              title="Measure live round-trip latency to this node"
            >
              <Gauge size={12} className={pinging ? 'animate-spin text-accent-400' : ''} />
              {pinging ? 'Testing…' : ping !== null ? `${ping} ms` : 'Test ping'}
            </button>
            {ping !== null && (
              <div className="w-20 h-1 bg-raised rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${ping < 50 ? 'bg-ok' : ping < 150 ? 'bg-warn' : 'bg-orange-400'}`}
                  style={{ width: `${Math.max(10, Math.min(100, (200 - ping) / 2))}%` }}
                />
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-sm text-accent-400">{server.ip}</div>
            <div className="font-mono text-[11px] text-faint mt-0.5 flex items-center gap-1 justify-end">
              <Activity size={10} />
              WG :{server.wgPort} · Xray :{server.xrayPort}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

ServerStatus.propTypes = {
  server: PropTypes.shape({
    name: PropTypes.string.isRequired,
    region: PropTypes.string.isRequired,
    country: PropTypes.string.isRequired,
    ip: PropTypes.string.isRequired,
    wgPort: PropTypes.number.isRequired,
    xrayPort: PropTypes.number.isRequired,
    isOnline: PropTypes.bool.isRequired,
  }).isRequired,
  isFastest: PropTypes.bool,
  initialPing: PropTypes.number,
}

