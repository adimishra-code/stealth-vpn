import { useState } from 'react'
import { Link } from 'react-router'
import { Loader2, MailCheck } from 'lucide-react'
import { useForgotPasswordMutation } from '../features/auth/authApi'

function Brand() {
  return (
    <Link to="/" className="glow-accent">
      <span className="font-mono font-semibold text-xl tracking-tight text-ink">
        stealth<span className="text-accent-400">vpn</span>
      </span>
    </Link>
  )
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [forgot, { isLoading }] = useForgotPasswordMutation()

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await forgot({ email }).unwrap()
    } catch {
      // always show success to avoid email enumeration
    }
    setSent(true)
  }

  if (sent) {
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
            <h1 className="font-display text-xl font-semibold text-ink mb-2">Check your email</h1>
            <p className="text-sm text-muted mb-6">
              If an account exists for {email}, a reset link is on its way.
            </p>
            <Link to="/login" className="btn-secondary inline-block">Back to login</Link>
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
          <h1 className="font-display text-xl font-semibold text-ink tracking-tight mb-1">Forgot password</h1>
          <p className="text-sm text-faint mb-6">We&apos;ll email you a reset link.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="fp-email">Email</label>
              <input
                id="fp-email"
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full disabled:opacity-50">
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {isLoading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <p className="mt-5 text-sm text-muted">
            Remembered it? <Link to="/login" className="text-accent-300 hover:text-accent-200 font-medium transition-colors duration-fast">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
