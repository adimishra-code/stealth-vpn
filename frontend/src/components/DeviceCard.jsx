import { useState } from 'react'
import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import { Link } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { Laptop, Smartphone, Download, QrCode, Trash2, X, Activity, Calendar, RefreshCw, Copy, Check, Radar, Zap } from 'lucide-react'
import { useGetQrQuery, useGetVlessQuery, useDownloadConfigMutation, useRevokeDeviceMutation } from '../features/devices/devicesApi'
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
  const planExpiresAt = user?.planExpiresAt ? new Date(user.planExpiresAt) : null
  const daysLeft = planExpiresAt
    ? Math.max(0, Math.ceil((planExpiresAt - new Date()) / 86400000))
    : null
  const expiringSoon = daysLeft !== null && daysLeft <= 3 && daysLeft > 0
  const expired = daysLeft === 0 && planExpiresAt && planExpiresAt < new Date()
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrTab, setQrTab] = useState(device.mode === 'stealth' ? 'stealth' : 'wireguard')
  const [copiedVless, setCopiedVless] = useState(false)

  const { data: qrData, refetch: fetchQr, isFetching: qrLoading } = useGetQrQuery(device.id, { skip: !showQr })
  const { data: vlessData, refetch: fetchVless, isFetching: vlessLoading } = useGetVlessQuery(device.id, { skip: !showQr })
  const [downloadConfigMutation] = useDownloadConfigMutation()
  const [revoke, { isLoading: revoking }] = useRevokeDeviceMutation()

  const downloadConfig = async (format = 'wireguard') => {
    const result = await downloadConfigMutation({ id: device.id, format })
    if (result.data) {
      const ext = format === 'singbox' ? 'json' : (format === 'clash' || format === 'clash-yaml') ? 'yaml' : 'conf'
      const mime = format === 'singbox' ? 'application/json' : format.includes('clash') ? 'text/yaml' : 'text/plain'
      const blob = new Blob([result.data], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stealth-${device.deviceName || 'device'}-${format}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleCopyVless = async () => {
    if (!vlessData?.vlessUri) return
    try {
      await navigator.clipboard.writeText(vlessData.vlessUri)
      setCopiedVless(true)
      setTimeout(() => setCopiedVless(false), 2000)
    } catch {
      window.alert(vlessData.vlessUri)
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
            <button
              onClick={() => {
                setShowQr(!showQr)
                if (!showQr) {
                  fetchQr()
                  fetchVless()
                }
              }}
              className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
            >
              {showQr ? <X size={13} /> : <QrCode size={13} />}
              {showQr ? 'Hide Config' : 'Export & QR'}
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
        <div className="mt-4 rounded-xl border border-line bg-void/70 p-4 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={() => setQrTab('stealth')}
              className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg border transition-colors ${
                qrTab === 'stealth'
                  ? 'bg-accent-400/15 border-accent-400/40 text-accent-300'
                  : 'border-line text-faint hover:text-ink'
              }`}
            >
              <Radar size={13} />
              Stealth Reality (VLESS)
            </button>
            <button
              onClick={() => setQrTab('wireguard')}
              className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg border transition-colors ${
                qrTab === 'wireguard'
                  ? 'bg-raised border-line-strong text-ink'
                  : 'border-line text-faint hover:text-ink'
              }`}
            >
              <Zap size={13} />
              WireGuard
            </button>
          </div>

          {qrTab === 'stealth' && (
            <div className="flex flex-col items-center gap-4">
              {vlessLoading ? (
                <div className="h-[180px] w-[180px] skeleton" />
              ) : vlessData?.vlessUri ? (
                <>
                  <div className="bg-white rounded-lg p-3">
                    <QRCodeSVG value={vlessData.qrDataUrl || vlessData.vlessUri} size={180} />
                  </div>

                  <div className="w-full flex items-center gap-2 max-w-md">
                    <code className="flex-1 font-mono text-[11px] text-accent-300 bg-surface border border-line rounded-lg px-2.5 py-2 truncate">
                      {vlessData.vlessUri}
                    </code>
                    <button
                      onClick={handleCopyVless}
                      className="btn-secondary !py-2 !px-3 text-xs shrink-0 flex items-center gap-1"
                    >
                      {copiedVless ? <Check size={13} className="text-accent-400" /> : <Copy size={13} />}
                      {copiedVless ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {/* Multi-Format Export Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-line/60 w-full">
                    <button
                      onClick={() => downloadConfig('singbox')}
                      className="btn-secondary text-xs !py-1.5 !px-2.5 flex items-center gap-1.5"
                      title="Download Sing-box JSON profile"
                    >
                      <Download size={12} />
                      Sing-box (.json)
                    </button>
                    <button
                      onClick={() => downloadConfig('clash-yaml')}
                      className="btn-secondary text-xs !py-1.5 !px-2.5 flex items-center gap-1.5"
                      title="Download Clash Meta YAML profile"
                    >
                      <Download size={12} />
                      Clash Meta (.yaml)
                    </button>
                    <button
                      onClick={() => downloadConfig('vless')}
                      className="btn-secondary text-xs !py-1.5 !px-2.5 flex items-center gap-1.5"
                      title="Download raw VLESS text"
                    >
                      <Download size={12} />
                      VLESS (.txt)
                    </button>
                  </div>

                  <p className="text-[11px] text-faint text-center">
                    Compatible with v2rayN, V2RayNG, Shadowrocket, Sing-Box, and Clash Verge.
                  </p>
                </>
              ) : (
                <p className="text-xs text-warn">Stealth Reality credentials unavailable.</p>
              )}
            </div>
          )}

          {qrTab === 'wireguard' && (
            <div className="flex flex-col items-center gap-4">
              {qrLoading ? (
                <div className="h-[180px] w-[180px] skeleton" />
              ) : qrData?.qrDataUrl ? (
                <>
                  <div className="bg-white rounded-lg p-3">
                    <QRCodeSVG value={qrData.qrDataUrl} size={180} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadConfig('wireguard')}
                      className="btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5"
                      title="Download WireGuard .conf profile"
                    >
                      <Download size={13} />
                      Download WireGuard (.conf)
                    </button>
                  </div>
                  <p className="text-[11px] text-faint text-center">Scan with the official WireGuard app on iOS / Android or import into desktop client.</p>
                </>
              ) : (
                <p className="text-xs text-warn">QR code unavailable.</p>
              )}
            </div>
          )}
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
    platform: PropTypes.string,
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

