import PropTypes from 'prop-types'
import { AlertTriangle } from 'lucide-react'

// Replaces window.confirm: never blockable by the browser, and gets a
// loading state while the destructive mutation is in flight.
export default function ConfirmModal({ title, message, confirmLabel, danger, loading, onConfirm, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line-strong rounded-2xl p-6 w-96 shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-ink mb-2 flex items-center gap-2">
          {danger && <AlertTriangle size={16} className="text-danger shrink-0" />}
          {title}
        </h3>
        <p className="text-sm text-muted mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg border border-line-strong text-muted text-sm hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-void font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150 ${
              danger ? 'bg-danger hover:brightness-110' : 'bg-accent-400 hover:brightness-110'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

ConfirmModal.propTypes = {
  title: PropTypes.string.isRequired,
  message: PropTypes.node.isRequired,
  confirmLabel: PropTypes.string.isRequired,
  danger: PropTypes.bool,
  loading: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
