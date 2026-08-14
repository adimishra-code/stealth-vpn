import { useEffect, useState } from 'react'
import { subscribeToToasts } from '../lib/toast'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

const TYPE_ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const TYPE_CLASS = {
  success: 'toast-success',
  error: 'toast-error',
  warning: 'toast-warning',
  info: 'toast-info',
}

const AUTO_DISMISS_MS = 4000

// Renders toasts pushed via the imperative toast helper (src/lib/toast.js).
export default function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(
    () =>
      subscribeToToasts((t) => {
        setToasts((prev) => [...prev, t])
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id))
        }, AUTO_DISMISS_MS)
      }),
    []
  )

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => {
        const Icon = TYPE_ICON[t.type] || Info
        return (
          <div key={t.id} className={`toast ${TYPE_CLASS[t.type] || 'toast-info'}`} role="status">
            <Icon size={16} className="shrink-0 mt-0.5" />
            <p className="min-w-0 flex-1">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="shrink-0 text-faint hover:text-ink transition-colors duration-fast"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
