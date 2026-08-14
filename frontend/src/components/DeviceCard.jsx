import { useState } from 'react'
import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import { Link } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { Laptop, Smartphone, Download, QrCode, Trash2, X, Activity, Calendar, RefreshCw } from 'lucide-react'
import { useGetQrQuery, useDownloadConfigQuery, useRevokeDeviceMutation } from '../features/devices/devicesApi'
import { selectUser } from '../features/auth/authSlice'
import ModeToggle from './ModeToggle'

const NODE_LABEL = {
  mumbai: { flag: '🇮🇳', city: 'Mumbai' },
  frankfurt: { flag: '🇩🇪', city: 'Frankfurt' },
}

// Phones get a phone glyph, everything else a laptop. Cosmetic only.
function isPhoneName(name = '') {
  return /phone|ios|android|pixel|galaxy|iphone/i.test(name)
}

export default function DeviceCard({ device }) {
  const user = useSelector(selectUser)
  // Per-device display uses the user's plan expiry — every device on the
  // account expires together when the plan lapses (User.planExpiresAt is
  // the single source of truth, devices don't carry their own).
  const planExpiresAt = user?.planExpiresAt ? new Date(user.planExpiresAt) : null
  const daysLeft = planExpiresAt
    ? Math.max(0, Math.ceil((planExpiresAt - new Date()) / 86400000))
    : null
  const expiringSoon = daysLeft !== null && daysLeft <= 3 && daysLeft > 0
  const expired = daysLeft === 0 && planExpiresAt && planExpiresAt < new Date()
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const { data: qrData, refetch: fetchQr, isFetching: qrLoading } = useGetQrQuery(device.id, { skip: !showQr })
  const { refetch: fetchConfig } = useDownloadConfigQuery(device.id, { skip: true })
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

  const isPhone = isPhoneName(device.deviceName)
  const node = NODE_LABEL[device.serverNode] || { flag: '🌐', city: device.serverNode }
  const usedGB = (device.bandwidthUsedMB / 1024).toFixed(2)
  const quotaGB = device.quotaMB ? (device.quotaMB / 1024).toFixed(0) : null
  const status = device.status || (device.isActive ? 'active' : 'revoked')
  const statusChip = status === 'active'
    ? 'chip-ok'
    : status === 'expired'
      ? 'chip-warn'
      : 'chip-danger'
  // Amber dot for active devices whose plan is about to lapse — visual
  // nudge that the user needs to renew. Distinct from the terminal
  // "expired" chip used when status==='expired'.
  const dotTone = expired
    ? 'bg-warn'
    : status === 'expired'
      ? 'bg-warn'
      : status === 'revoked'
        ? 'bg-faint'
        : expiringSoon
          ? 'bg-warn'
          : 'bg-ok'
  const dotPulse = device.isActive && !expired && status !== 'expired'

  return (
    <div className={`card card-hover group ${device.isActive ? '' : 'opacity-55'}`}>
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
        <div className="flex items-center gap-3.5 min-w-0 md:flex-1">
          <span className="relative flex h-2 w-2 shrink-0">
            {dotPulse && (
              <span className={`absolute inline-flex h-full w-full rounded-full ${dotTone} ${expiringSoon ? 'animate-pulse' : 'animate-ping-dot'}`} />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${dotTone} ${dotPulse ? 'shadow-dot' : ''}`} />
          </span>

          <div className="w-10 h-10 rounded-lg bg-raised/80 border border-line flex items-center justify-center shrink-0">
            {isPhone
              ? <Smartphone size={18} className="text-muted" strokeWidth={1.75} />
              : <Laptop size={18} className="text-muted" strokeWidth={1.75} />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-ink truncate">{device.deviceName}</h3>
              {device.plan && <span className="chip-accent shrink-0">{device.plan.toUpperCase()}</span>}
              <span className={`chip shrink-0 ${statusChip}`}>{status.toUpperCase()}</span>
            </div>
            <p className="font-mono text-xs text-faint flex items-center gap-1.5 mt-1 truncate">
              <span>{node.flag}</span>
              <span>{node.city}</span>
              <span className="text-faint/60">·</span>
              <span>{device.assignedIP}</span>
              <span className="text-faint/60">·</span>
              <span className="flex items-center gap-1"><Activity size={11} /> {usedGB} GB</span>
            </p>
            {planExpiresAt && (
              <p
                className={`font-mono text-[11px] mt-1 flex items-center gap-1 ${
                  expired || expiringSoon ? 'text-warn' : 'text-faint'
                }`}
                title={planExpiresAt.toLocaleString()}
              >
                <Calendar size={10} />
                {expired
                  ? `Expired ${planExpiresAt.toLocaleDateString()}`
                  : `Expires ${planExpiresAt.toLocaleDateString()} · ${daysLeft}d left`}
              </p>
            )}
          </div>
        </div>

        {device.isActive && (
          <div className="md:w-56 md:shrink-0">
            <ModeToggle device={device} />
          </div>
        )}

        {device.isActive && (
          <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
            <button onClick={downloadConfig} className="btn-secondary !py-1.5 !px-3 text-xs">
              <Download size={13} />
              .conf
            </button>
            <button
              onClick={() => {
                setShowQr(!showQr)
                if (!showQr) fetchQr()
              }}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              {showQr ? <X size={13} /> : <QrCode size={13} />}
              {showQr ? 'Close' : 'QR code'}
            </button>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className={`${confirmRevoke ? 'btn-danger' : 'btn-secondary'} !py-1.5 !px-3 text-xs`}
            >
              <Trash2 size={13} />
              {revoking ? 'Revoking…' : confirmRevoke ? 'Confirm?' : 'Revoke'}
            </button>
          </div>
        )}

        {!device.isActive && (
          <div className="md:w-56 md:shrink-0 flex justify-end">
            <Link
              to="/billing"
              className="btn-primary !py-1.5 !px-3 text-xs"
              title="Your plan expired — renew to restore this device"
            >
              <RefreshCw size={13} />
              Renew plan
            </Link>
          </div>
        )}

        {device.isActive && expired && (
          <div className="md:shrink-0 flex justify-end">
            <Link
              to="/billing"
              className="btn-primary !py-1.5 !px-3 text-xs"
              title="Your plan lapsed — renew to keep this device online"
            >
              <RefreshCw size={13} />
              Renew plan
            </Link>
          </div>
        )}
      </div>

      {quotaGB && (
        <div className="mt-4 animate-fade-in">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-faint">Monthly quota</span>
            <span className="font-mono text-muted">
              {usedGB} / {quotaGB} GB
              {device.quotaExceeded && <span className="text-danger ml-2">exceeded — revoked</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-raised overflow-hidden">
            <div
              className={`h-full rounded-full ${device.quotaExceeded ? 'bg-danger' : 'bg-accent-400'}`}
              style={{ width: `${Math.min(100, ((device.bandwidthUsedMB || 0) / device.quotaMB) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-faint mt-1.5">Resets on the 1st of the month (UTC)</p>
        </div>
      )}

      {showQr && (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg bg-white p-5 animate-fade-in">
          {qrLoading ? (
            <div className="h-[180px] w-[180px] skeleton" />
          ) : qrData?.qrDataUrl ? (
            <>
              <QRCodeSVG value={qrData.qrDataUrl} size={180} />
              <p className="text-[11px] text-faint">Scan with the WireGuard app</p>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

DeviceCard.propTypes = {
  device: PropTypes.shape({
    id: PropTypes.string.isRequired,
    _id: PropTypes.string,
    deviceName: PropTypes.string.isRequired,
    platform: PropTypes.string.isRequired,
    serverNode: PropTypes.string,
    isActive: PropTypes.bool.isRequired,
    status: PropTypes.string,
    plan: PropTypes.string,
    mode: PropTypes.oneOf(['gaming', 'stealth']),
    bandwidthUsedMB: PropTypes.number,
    quotaMB: PropTypes.number,
    quotaExceeded: PropTypes.bool,
    assignedIP: PropTypes.string,
    lastSeen: PropTypes.string,
  }).isRequired,
}
