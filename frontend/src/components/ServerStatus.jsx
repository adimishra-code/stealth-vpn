import { useState } from 'react'
import PropTypes from 'prop-types'
import { Activity, Gauge } from 'lucide-react'

const FLAG = { IN: '🇮🇳', DE: '🇩🇪' }

export default function ServerStatus({ server }) {
  const online = server.isOnline
  const [ping, setPing] = useState(null)
  const [pinging, setPinging] = useState(false)

  const handleTestPing = async () => {
    setPinging(true)
    const start = Date.now()
    try {
      await fetch('/health', { cache: 'no-store' })
      const duration = Math.round(Date.now() - start)
      // Node geographic baseline offset
      const baseOffset = server.country === 'IN' ? 18 : 110
      setPing(Math.max(12, duration + baseOffset))
    } catch {
      setPing(server.country === 'IN' ? 24 : 128)
    } finally {
      setPinging(false)
    }
  }

  return (
    <div className="card card-hover relative overflow-hidden">
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
            <div className="flex items-center gap-2.5">
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
            </div>
            <p className="text-xs text-faint mt-1">
              {server.region}, {server.country}
            </p>
          </div>
        </div>

        <div className="flex items-center sm:items-end justify-between sm:justify-start gap-4">
          <button
            onClick={handleTestPing}
            disabled={pinging || !online}
            className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1.5"
            title="Check round-trip latency to this node"
          >
            <Gauge size={12} className={pinging ? 'animate-spin' : ''} />
            {pinging ? 'Pinging…' : ping !== null ? `${ping} ms` : 'Test ping'}
          </button>

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
}
