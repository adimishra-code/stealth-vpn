import { useState } from 'react'
import PropTypes from 'prop-types'
import { useExtendDeviceMutation } from '../../features/admin/adminApi'
import { toast } from '../../lib/toast'

// Controlled modal for adding days to a device's plan expiry. Not a full-page
// overlay — a small centered dialog with a number input.
export default function ExtendModal({ deviceId, deviceName, onClose }) {
  const [days, setDays] = useState(30)
  const [extendDevice, { isLoading }] = useExtendDeviceMutation()

  const handleSubmit = async () => {
    try {
      await extendDevice({ deviceId, days }).unwrap()
      toast.success(`${deviceName} extended by ${days} days`)
      onClose()
    } catch (err) {
      toast.error(err?.data?.error ?? 'Failed to extend device')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line-strong rounded-2xl p-6 w-80 shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-ink mb-1">Extend Expiry</h3>
        <p className="text-sm text-muted mb-4">{deviceName} — add days to current expiry</p>

        <label className="text-xs text-faint uppercase tracking-widest" htmlFor="extend-days">
          Days to add
        </label>
        <input
          id="extend-days"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input w-full mt-1"
        />

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-line-strong text-muted text-sm hover:bg-raised transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || days < 1 || days > 365}
            className="flex-1 py-2.5 rounded-lg bg-accent-400 text-void font-semibold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
          >
            {isLoading ? 'Extending…' : `Add ${days} days`}
          </button>
        </div>
      </div>
    </div>
  )
}

ExtendModal.propTypes = {
  deviceId: PropTypes.string.isRequired,
  deviceName: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
}
