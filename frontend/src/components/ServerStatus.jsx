import PropTypes from 'prop-types'

const FLAG = { IN: '🇮🇳', DE: '🇩🇪' }

export default function ServerStatus({ server }) {
  const online = server.isOnline

  return (
    <div className="card card-hover relative overflow-hidden">
      {/* Left status bar — green when online, red when down */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${online ? 'bg-ok shadow-dot' : 'bg-danger'}`}
      />

      <div className="flex items-center justify-between gap-4 pl-3">
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

        <div className="text-right shrink-0">
          <div className="font-mono text-sm text-accent-400">{server.ip}</div>
          <div className="font-mono text-[11px] text-faint mt-0.5">
            WG :{server.wgPort} · Xray :{server.xrayPort}
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
