import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useGetQrQuery, useDownloadConfigQuery, useRevokeDeviceMutation } from '../features/devices/devicesApi'
import ModeToggle from './ModeToggle'

const flagEmoji = {
  mumbai: '🇮🇳',
  frankfurt: '🇩🇪',
}

export default function DeviceCard({ device }) {
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const { data: qrData, refetch: fetchQr, isFetching: qrLoading } = useGetQrQuery(device.id, { skip: !showQr })
  const { data: configText, refetch: fetchConfig } = useDownloadConfigQuery(device.id, { skip: true })
  const [revoke, { isLoading: revoking }] = useRevokeDeviceMutation()

  const downloadConfig = async () => {
    const result = await fetchConfig()
    if (result.data) {
      const blob = new Blob([result.data], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stealth-${device.deviceName || 'device'}.conf`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleRevoke = async () => {
    if (!confirmRevoke) {
      setConfirmRevoke(true)
      setTimeout(() => setConfirmRevoke(false), 4000)
      return
    }
    await revoke(device.id)
  }

  return (
    <div className={`card ${device.isActive ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-stealth-800 flex items-center justify-center text-xl">
            💻
          </div>
          <div>
            <h3 className="font-semibold text-white">{device.deviceName}</h3>
            <p className="text-xs text-slate-500">
              {flagEmoji[device.serverNode] || '🌐'} {device.serverNode} · {device.assignedIP}
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-bold px-2 py-1 rounded-full ${
            device.isActive
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/40'
          }`}
        >
          {device.isActive ? 'ACTIVE' : 'REVOKED'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        {device.isActive && <ModeToggle device={device} />}
        <div className="text-xs text-slate-500">
          📊 {(device.bandwidthUsedMB / 1024).toFixed(2)} GB used
          {device.lastSeen && <div>Last seen: {new Date(device.lastSeen).toLocaleDateString()}</div>}
        </div>
      </div>

      {showQr && (
        <div className="mb-4 flex flex-col items-center gap-2">
          {qrLoading ? (
            <div className="text-xs text-slate-500">Generating QR...</div>
          ) : qrData?.qrDataUrl ? (
            <>
              <QRCodeSVG value={qrData.qrDataUrl} size={180} />
              <p className="text-[11px] text-slate-500">Scan with the WireGuard app</p>
            </>
          ) : null}
        </div>
      )}

      {device.isActive && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadConfig}
            className="btn-secondary !py-1.5 !px-3 text-xs"
          >
            ⬇ .conf
          </button>
          <button
            onClick={() => {
              setShowQr(!showQr)
              if (!showQr) fetchQr()
            }}
            className="btn-secondary !py-1.5 !px-3 text-xs"
          >
            {showQr ? '✕ Close QR' : '📱 QR'}
          </button>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className={`${confirmRevoke ? 'btn-danger' : 'btn-secondary'} !py-1.5 !px-3 text-xs disabled:opacity-50`}
          >
            {revoking ? 'Revoking...' : confirmRevoke ? 'Confirm revoke?' : '🗑 Revoke'}
          </button>
        </div>
      )}
    </div>
  )
}
