import { useState } from 'react'
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

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${mode === 'stealth' ? 'text-stealth-400' : 'text-slate-500'}`}>
          Stealth
        </span>
        <div className="w-9 h-5 rounded-full bg-stealth-800 border border-stealth-700 relative">
          <div
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
              mode === 'gaming' ? 'left-4.5 bg-emerald-400' : 'left-0.5 bg-stealth-500'
            }`}
            style={{ left: mode === 'gaming' ? '18px' : '2px' }}
          />
          <input
            type="checkbox"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            checked={mode === 'gaming'}
            disabled={isLoading}
            onChange={() => handleToggle(mode === 'stealth' ? 'gaming' : 'stealth')}
          />
        </div>
        <span className={`text-xs font-semibold ${mode === 'gaming' ? 'text-emerald-400' : 'text-slate-500'}`}>
          Gaming
        </span>
        {isLoading && <span className="text-xs text-slate-500 animate-pulse">...</span>}
      </div>
      <p className="text-[11px] text-slate-500" title="Gaming mode adds only 2–4ms latency">
        {mode === 'gaming' ? '⚡ Raw WG — +2–4ms' : '🛰️ Cloaked HTTPS'}
      </p>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  )
}
