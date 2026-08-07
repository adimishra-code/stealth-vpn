import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router'
import { useSelector, useDispatch } from 'react-redux'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useLoginMutation } from '../features/auth/authApi'
import { setCredentials, selectToken } from '../features/auth/authSlice'

function Brand() {
  return (
    <Link to="/" className="glow-accent">
      <span className="font-mono font-semibold text-xl tracking-tight text-ink">
        stealth<span className="text-accent-400">vpn</span>
      </span>
    </Link>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(null)
  const [shake, setShake] = useState(0)
  const [login, { isLoading }] = useLoginMutation()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const token = useSelector(selectToken)

  // Already signed in — the login page has nothing to offer.
  if (token) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const body = { email, password }
      if (needTotp && totpCode) body.totpCode = totpCode
      const res = await login(body).unwrap()
      dispatch(setCredentials(res))
      navigate('/dashboard')
    } catch (err) {
      const msg = err.data?.error || 'Login failed'
      setError(msg)
      // The server only reveals 2FA is active after a correct password — the
      // challenge appears exactly when it is needed.
      if (msg === 'Two-factor code required') setNeedTotp(true)
      setShake((s) => s + 1)
    }
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
          <h1 className="font-display text-xl font-semibold text-ink tracking-tight mb-1">Welcome back</h1>
          <p className="text-sm text-faint mb-6">Log in to your StealthVPN account</p>

          {error && (
            <div
              key={shake}
              className="flex items-start gap-2.5 text-danger text-sm rounded-lg p-3 mb-4 animate-fade-in animate-shake border border-danger/30 bg-danger/10"
              role="alert"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
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
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className={`input pr-11 ${error ? 'input-error' : ''}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors duration-fast"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {needTotp && (
              <div className="animate-fade-in">
                <label className="label" htmlFor="totp-code">Authenticator code</label>
                <input
                  id="totp-code"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  className="input font-mono tracking-[0.3em]"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                />
              </div>
            )}
            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {isLoading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-line flex justify-between text-sm">
            <Link to="/forgot-password" className="text-muted hover:text-ink transition-colors duration-fast">Forgot password?</Link>
            <Link to="/register" className="text-accent-300 hover:text-accent-200 font-medium transition-colors duration-fast">Create account</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
