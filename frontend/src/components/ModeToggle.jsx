import { useState } from 'react'
import PropTypes from 'prop-types'
import { Zap, Radar } from 'lucide-react'
import { useToggleModeMutation } from '../features/devices/devicesApi'

export default function ModeToggle({ device }) {
  const [mode, setMode] = useState(device.mode)
  const [toggle, { isLoading }] = useToggleModeMutation()
  const [error, setError] = useState(null)

  const handleToggle = async (nextMode) => {
    setError(null)
    try {
      await toggle({ id: device.id, mode: nextMode }).unwrap()
      setMode(nextMode)
    } catch (err) {
      setError(err.data?.error || 'Failed to switch mode')
    }
  }

  const stealthOn = mode === 'stealth'

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-1 rounded-lg bg-void/70 border border-line p-1">
        {/* Sliding thumb — physical switch feel, 200ms smooth */}
        <span
          aria-hidden="true"
          className={`absolute top-1 bottom-1 left-1 rounded-md border transition-transform duration-200 ease-smooth ${
            stealthOn
              ? 'bg-accent-400/15 border-accent-400/40 shadow-glow-accent'
              : 'bg-raised border-line'
          }`}
          style={{ width: 'calc(50% - 6px)' }}
        />

        {[
          { key: 'stealth', label: 'Stealth', Icon: Radar },
          { key: 'gaming', label: 'Gaming', Icon: Zap },
        ].map(({ key, label, Icon }) => {
          const on = mode === key
          return (
            <button
              key={key}
              onClick={() => !on && handleToggle(key)}
              disabled={isLoading || on}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2 rounded-md transition-colors duration-fast ${
                on
                  ? key === 'stealth'
                    ? 'text-accent-300'
                    : 'text-ink'
                  : 'text-faint hover:text-muted'
              } ${isLoading ? 'opacity-60' : ''}`}
              title={key === 'gaming' ? 'Raw WireGuard — +2–4ms' : 'Cloaked as HTTPS'}
            >
              <Icon size={13} strokeWidth={2} className={on && key === 'stealth' ? 'glow-accent' : ''} />
              {label}
            </button>
          )
        })}
      </div>
      {error && (
        <p className="text-[11px] text-danger mt-1.5 animate-fade-in font-medium">{error}</p>
      )}
    </div>
  )
}

ModeToggle.propTypes = {
  device: PropTypes.shape({
    id: PropTypes.string.isRequired,
    mode: PropTypes.oneOf(['gaming', 'stealth']).isRequired,
  }).isRequired,
}
