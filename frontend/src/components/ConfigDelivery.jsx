import { useState } from 'react'
import PropTypes from 'prop-types'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Download, Radar, Zap, X, ShieldAlert } from 'lucide-react'

const wgSteps = [
  { os: 'Windows', cmd: 'Download the .conf file → Open WireGuard → Import tunnel from file' },
  { os: 'macOS', cmd: 'Download .conf → Open WireGuard → Import from file → Activate' },
  { os: 'Android / iOS', cmd: 'Scan the QR code with the WireGuard app → tap to connect' },
  { os: 'Linux', cmd: 'sudo wg-quick up /path/to/stealth.conf' },
]

const stealthSteps = [
  { os: 'v2rayN', cmd: 'Import the VLESS URI below → select the Reality node → connect' },
  { os: 'V2RayNG', cmd: 'Import URI from clipboard → tap the connection to activate' },
  { os: 'Shadowrocket', cmd: 'Scan or paste the URI → toggle it on' },
  { os: 'Desktop', cmd: 'Use v2rayN / Nekoray with the copied URI — TCP 443, cloaked as TLS 1.3' },
]

export default function ConfigDelivery({ config, qrDataUrl, deviceName, onClose, vlessUri }) {
  const [copied, setCopied] = useState(false)
  const [vlessCopied, setVlessCopied] = useState(false)
  // Presentational only — the device mode was fixed at order time. This just
  // picks which delivery tab is emphasized first.
  const [tab, setTab] = useState(vlessUri ? 'stealth' : 'wireguard')

  const download = () => {
    const blob = new Blob([config], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stealth-${deviceName || 'device'}.conf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — show the raw config instead
      window.alert(config)
    }
  }

  const copyVless = async () => {
    try {
      await navigator.clipboard.writeText(vlessUri)
      setVlessCopied(true)
      setTimeout(() => setVlessCopied(false), 2000)
    } catch {
      window.alert(vlessUri)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[4px] p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-surface border border-line-strong rounded-2xl shadow-card max-w-lg w-full max-h-[90vh] overflow-y-auto animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink tracking-tight">Device ready</h2>
              <p className="text-xs text-faint mt-0.5 font-mono">{deviceName || 'device'}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-faint hover:text-ink hover:bg-raised transition-colors duration-fast"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Mode pill — sliding indicator, accent on the active side */}
          <div className="relative flex items-center gap-1 rounded-lg bg-void/70 border border-line p-1 mb-6">
            <span
              aria-hidden="true"
              className={`absolute top-1 bottom-1 left-1 rounded-md border transition-transform duration-200 ease-smooth ${
                tab === 'stealth' ? 'bg-accent-400/15 border-accent-400/40 shadow-glow-accent' : 'bg-raised border-line'
              }`}
              style={{ width: 'calc(50% - 6px)' }}
            />
            <button
              onClick={() => setTab('stealth')}
              disabled={!vlessUri}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-2 rounded-md transition-colors duration-fast ${
                tab === 'stealth' ? 'text-accent-300' : 'text-faint hover:text-muted'
              } ${!vlessUri ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={vlessUri ? undefined : 'VLESS URI unavailable'}
            >
              <Radar size={13} strokeWidth={2} />
              Stealth (Reality)
            </button>
            <button
              onClick={() => setTab('wireguard')}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-2 rounded-md transition-colors duration-fast ${
                tab === 'wireguard' ? 'text-ink' : 'text-faint hover:text-muted'
              }`}
            >
              <Zap size={13} strokeWidth={2} />
              WireGuard
            </button>
          </div>

          {/* ── Stealth tab ── */}
          {tab === 'stealth' && vlessUri && (
            <div className="animate-fade-in" key="stealth">
              <p className="text-xs text-faint mb-3 leading-relaxed">
                Import this URI in v2rayN / V2RayNG / Shadowrocket for the stealth tunnel
                (TCP 443, cloaked as TLS 1.3 to a major CDN). WireGuard and Xray run in
                parallel — switch between them from the dashboard.
              </p>
              <div className="flex items-stretch gap-2 mb-5">
                <code className="flex-1 font-mono text-[11px] text-accent-300 bg-void/70 border border-accent-400/30 rounded-lg px-3 py-2.5 break-all">
                  {vlessUri}
                </code>
                <button
                  onClick={copyVless}
                  className={`group relative flex items-center justify-center w-11 rounded-lg border transition-all duration-fast ${
                    vlessCopied
                      ? 'border-accent-400/60 bg-accent-400/15 text-accent-300'
                      : 'border-line text-faint hover:border-line-strong hover:text-ink hover:bg-raised'
                  }`}
                  aria-label={vlessCopied ? 'Copied' : 'Copy URI'}
                >
                  {vlessCopied ? <Check size={16} /> : <Copy size={16} />}
                  {/* Label slides in on hover */}
                  <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-raised border border-line px-2 py-1 font-sans text-[11px] text-ink shadow-tooltip opacity-0 translate-x-1 transition-all duration-fast group-hover:opacity-100 group-hover:translate-x-0">
                    {vlessCopied ? 'Copied' : 'Copy URI'}
                  </span>
                </button>
              </div>
              <h3 className="font-semibold text-ink mb-3">Setup instructions</h3>
              <div className="space-y-2 mb-6">
                {stealthSteps.map((s) => (
                  <div key={s.os} className="bg-void/50 border border-line rounded-lg px-3.5 py-2.5">
                    <div className="text-xs font-mono font-semibold text-accent-300 mb-0.5">{s.os}</div>
                    <div className="text-xs text-muted leading-relaxed">{s.cmd}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── WireGuard tab ── */}
          {tab === 'wireguard' && (
            <div className="animate-fade-in" key="wg">
              <div className="grid grid-cols-2 gap-2 mb-5">
                <button onClick={download} className="btn-primary text-sm">
                  <Download size={14} />
                  Download .conf
                </button>
                <button onClick={copy} className="btn-secondary text-sm">
                  {copied ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy config'}
                </button>
              </div>

              <div className="flex flex-col items-center mb-5">
                {qrDataUrl ? (
                  <>
                    <div className="bg-white rounded-lg p-4">
                      <QRCodeSVG value={qrDataUrl} size={200} />
                    </div>
                    <p className="text-xs text-faint mt-2.5">Scan with WireGuard app (mobile)</p>
                  </>
                ) : (
                  <p className="text-sm text-faint">QR unavailable</p>
                )}
              </div>

              <h3 className="font-semibold text-ink mb-3">Setup instructions</h3>
              <div className="space-y-2 mb-6">
                {wgSteps.map((s) => (
                  <div key={s.os} className="bg-void/50 border border-line rounded-lg px-3.5 py-2.5">
                    <div className="text-xs font-mono font-semibold text-accent-300 mb-0.5">{s.os}</div>
                    <div className="text-xs text-muted leading-relaxed">{s.cmd}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!vlessUri && tab === 'stealth' && (
            <div className="flex items-start gap-2.5 text-xs text-faint bg-void/50 border border-line rounded-lg p-3 mb-4 animate-fade-in">
              <ShieldAlert size={14} className="text-warn shrink-0 mt-0.5" />
              Stealth URI is unavailable for this device — use the WireGuard config instead.
            </div>
          )}

          <p className="text-[11px] text-faint border-t border-line pt-4">
            Kill switch is on by default (BlockUntunneledTraffic = true). If you import this
            config into a third-party client, enable that client&apos;s own kill switch too.
            Your private key is stored encrypted on our servers (AES-256-GCM) and shown here only once.
          </p>
        </div>
      </div>
    </div>
  )
}

ConfigDelivery.propTypes = {
  config: PropTypes.string.isRequired,
  qrDataUrl: PropTypes.string,
  deviceName: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  vlessUri: PropTypes.string,
}
