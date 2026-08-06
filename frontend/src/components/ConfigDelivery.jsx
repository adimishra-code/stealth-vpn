import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const steps = [
  { os: 'Windows', cmd: 'Download the .conf file → Open WireGuard → Import tunnel from file' },
  { os: 'macOS', cmd: 'Download .conf → Open WireGuard → Import from file → Activate' },
  { os: 'Android / iOS', cmd: 'Scan the QR code with the WireGuard app → tap to connect' },
  { os: 'Linux', cmd: 'sudo wg-quick up /path/to/stealth.conf' },
]

export default function ConfigDelivery({ config, qrDataUrl, deviceName, onClose }) {
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-stealth-900 border border-stealth-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Device ready! 🎉</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={download} className="btn-primary text-sm">
              ⬇ Download .conf
            </button>
            <button onClick={copy} className="btn-secondary text-sm">
              {copied ? '✓ Copied!' : '📋 Copy config'}
            </button>
          </div>

          <div className="flex flex-col items-center mb-6">
            {qrDataUrl ? (
              <>
                <QRCodeSVG value={qrDataUrl} size={220} />
                <p className="text-xs text-slate-500 mt-2">Scan with WireGuard app (mobile)</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">QR unavailable</p>
            )}
          </div>

          <h3 className="font-semibold text-white mb-3">Setup instructions</h3>
          <div className="space-y-3 mb-4">
            {steps.map((s) => (
              <div key={s.os} className="bg-stealth-800/60 rounded-lg p-3">
                <div className="text-xs font-bold text-stealth-400 mb-1">{s.os}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{s.cmd}</div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-600 border-t border-stealth-700 pt-4">
            Kill switch is on by default (BlockUntunneledTraffic = true). If you import this
            config into a third-party client, enable that client's own kill switch too.
            Your private key is stored encrypted on our servers (AES-256-GCM) and shown here only once.
          </p>
        </div>
      </div>
    </div>
  )
}
