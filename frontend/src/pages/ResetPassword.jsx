import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router'
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { useResetPasswordMutation } from '../features/auth/authApi'

function Brand() {
  return (
    <Link to="/" className="glow-accent">
      <span className="font-mono font-semibold text-xl tracking-tight text-ink">
        stealth<span className="text-accent-400">vpn</span>
      </span>
    </Link>
  )
}

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [reset, { isLoading }] = useResetPasswordMutation()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    try {
      await reset({ token, password }).unwrap()
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.data?.error || 'Reset failed')
    }
  }

  if (!token) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center">
        <div className="w-full max-w-md animate-fade-up" style={{ animationDelay: '350ms' }}>
          <div className="flex justify-center mb-6">
            <Brand />
          </div>
          <div className="flex justify-center mb-8">
            <div className="w-8 h-px bg-accent/40" />
          </div>
          <div className="bg-surface border border-line-strong rounded-2xl p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
            <div className="w-14 h-14 rounded-2xl border border-danger/30 bg-danger/10 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={26} className="text-danger" strokeWidth={1.75} />
            </div>
            <h1 className="font-display text-xl font-semibold text-ink mb-2">Invalid reset link</h1>
            <p className="text-sm text-muted mb-6">
              This link is missing its reset token. Request a fresh one and try again.
            </p>
            <Link to="/forgot-password" className="btn-primary text-sm inline-flex">Request new link</Link>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center">
        <div className="w-full max-w-md animate-fade-up" style={{ animationDelay: '350ms' }}>
          <div className="flex justify-center mb-6">
            <Brand />
          </div>
          <div className="flex justify-center mb-8">
            <div className="w-8 h-px bg-accent/40" />
          </div>
          <div className="bg-surface border border-line-strong rounded-2xl p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
            <div className="w-14 h-14 rounded-2xl border border-ok/30 bg-ok/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={26} className="text-ok" strokeWidth={1.75} />
            </div>
            <h1 className="font-display text-xl font-semibold text-ink mb-2">Password updated</h1>
            <p className="text-sm text-muted">Redirecting to login…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center">
      <div className="w-full max-w-md animate-fade-up" style={{ animationDelay: '350ms' }}>
        <div className="flex justify-center mb-6">
          <Brand />
        </div>
        <div className="flex justify-center mb-8">
          <div className="w-8 h-px bg-accent/40" />
        </div>

        <div className="bg-surface border border-line-strong rounded-2xl p-8 shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
          <h1 className="font-display text-xl font-semibold text-ink tracking-tight mb-6">Set new password</h1>
          {error && (
            <div className="flex items-start gap-2.5 text-danger text-sm rounded-lg p-3 mb-4 animate-fade-in border border-danger/30 bg-danger/10" role="alert">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="rp-password">New password</label>
              <input
                id="rp-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={`input ${error ? 'input-error' : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="label" htmlFor="rp-confirm">Confirm password</label>
              <input
                id="rp-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={`input ${error ? 'input-error' : ''}`}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
              />
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full disabled:opacity-50">
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {isLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
          <p className="mt-5 text-sm text-muted">
            <Link to="/login" className="text-accent-300 hover:text-accent-200 font-medium transition-colors duration-fast">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
