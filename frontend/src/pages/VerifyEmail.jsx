import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import { useVerifyEmailMutation, useResendVerifyMutation } from '../features/auth/authApi'
import { toast } from '../lib/toast'

function Brand() {
  return (
    <Link to="/" className="glow-accent">
      <span className="font-mono font-semibold text-xl tracking-tight text-ink">
        stealth<span className="text-accent-400">vpn</span>
      </span>
    </Link>
  )
}

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [verify] = useVerifyEmailMutation()
  const [resendVerify, { isLoading: resending }] = useResendVerifyMutation()
  const [status, setStatus] = useState('verifying')
  const [error, setError] = useState(null)
  const [resendEmail, setResendEmail] = useState('')
  // Guards the double-fire under StrictMode (and any rapid re-renders).
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const run = async () => {
      if (!token) {
        setStatus('error')
        setError('Missing verification token')
        return
      }
      try {
        await verify({ token }).unwrap()
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setError(err.data?.error || 'Verification failed')
      }
    }
    run()
  }, [token, verify])

  const handleResend = async (e) => {
    e.preventDefault()
    if (!resendEmail) return
    try {
      await resendVerify({ email: resendEmail }).unwrap()
      toast.success('If that email is registered and unverified, a new link has been sent.')
    } catch {
      // Anti-enumeration: never reveal whether the email exists. Always
      // show success to the user regardless of the backend response.
      toast.success('If that email is registered and unverified, a new link has been sent.')
    }
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center">
      <div className="w-full max-w-md animate-fade-up">
        <div className="flex justify-center mb-8">
          <Brand />
        </div>

        <div className="card p-8 text-center">
          {status === 'verifying' && (
            <div className="flex flex-col items-center">
              <Loader2 size={28} className="text-accent-400 animate-spin mb-5" strokeWidth={1.75} />
              <h1 className="font-display text-xl font-semibold text-ink">Verifying your email…</h1>
            </div>
          )}
          {status === 'success' && (
            <div className="animate-fade-up">
              <div className="w-14 h-14 rounded-2xl border border-ok/30 bg-ok/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={26} className="text-ok" strokeWidth={1.75} />
              </div>
              <h1 className="font-display text-xl font-semibold text-ink mb-2">Email verified!</h1>
              <p className="text-sm text-muted mb-6">Your account is ready.</p>
              <Link to="/login" className="btn-primary inline-block">Log in</Link>
            </div>
          )}
          {status === 'error' && (
            <div className="animate-fade-up">
              <div className="w-14 h-14 rounded-2xl border border-danger/30 bg-danger/10 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle size={26} className="text-danger" strokeWidth={1.75} />
              </div>
              <h1 className="font-display text-xl font-semibold text-ink mb-2">Verification failed</h1>
              <p className="text-sm text-danger mb-5">{error}</p>
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <label className="label" htmlFor="resend-email">Email a new link</label>
                <div className="flex gap-2">
                  <input
                    id="resend-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input flex-1"
                  />
                  <button type="submit" disabled={resending} className="btn-primary !py-2 !px-3 text-sm disabled:opacity-50">
                    {resending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Resend
                  </button>
                </div>
              </form>
              <Link to="/" className="btn-secondary inline-block mt-4 text-sm">Go home</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
