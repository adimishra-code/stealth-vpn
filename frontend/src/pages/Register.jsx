import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useSelector } from 'react-redux'
import { AlertCircle, Loader2, MailCheck } from 'lucide-react'
import { useRegisterMutation } from '../features/auth/authApi'
import { selectToken } from '../features/auth/authSlice'

function Brand() {
  return (
    <Link to="/" className="glow-accent">
      <span className="font-mono font-semibold text-xl tracking-tight text-ink">
        stealth<span className="text-accent-400">vpn</span>
      </span>
    </Link>
  )
}

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [register, { isLoading }] = useRegisterMutation()
  const token = useSelector(selectToken)

  if (token) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!accepted) {
      setError('You must accept the Terms of Service and Privacy Policy')
      return
    }
    try {
      await register({ email, password }).unwrap()
      setSuccess(true)
    } catch (err) {
      setError(err.data?.error || 'Registration failed')
    }
  }

  if (success) {
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
            <div className="w-14 h-14 rounded-2xl border border-accent-400/30 bg-accent-400/10 flex items-center justify-center mx-auto mb-5">
              <MailCheck size={26} className="text-accent-300" strokeWidth={1.75} />
            </div>
            <h1 className="font-display text-xl font-semibold text-ink mb-2">Check your inbox</h1>
            <p className="text-sm text-muted mb-6">
              We sent a verification link to <span className="text-ink">{email}</span>.
              Click it to activate your account.
            </p>
            <Link to="/login" className="btn-primary inline-block">Go to login</Link>
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
          <h1 className="font-display text-xl font-semibold text-ink tracking-tight mb-1">Create account</h1>
          <p className="text-sm text-faint mb-6">Start with the free plan — upgrade anytime</p>

          {error && (
            <div className="flex items-start gap-2.5 text-danger text-sm rounded-lg p-3 mb-4 animate-fade-in border border-danger/30 bg-danger/10" role="alert">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                className={`input ${error ? 'input-error' : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
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
              <label className="label" htmlFor="reg-confirm">Confirm password</label>
              <input
                id="reg-confirm"
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
            <label className="flex items-start gap-2.5 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 accent-accent-400"
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="text-accent-300 hover:text-accent-200 underline underline-offset-2">Terms of Service</Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="text-accent-300 hover:text-accent-200 underline underline-offset-2">Privacy Policy</Link>.
              </span>
            </label>
            <button type="submit" disabled={isLoading} className="btn-primary w-full disabled:opacity-50">
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-sm text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-accent-300 hover:text-accent-200 font-medium transition-colors duration-fast">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
