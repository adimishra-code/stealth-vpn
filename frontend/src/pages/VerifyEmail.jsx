import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useVerifyEmailMutation } from '../features/auth/authApi'

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
  const [status, setStatus] = useState('verifying')
  const [error, setError] = useState(null)

  useEffect(() => {
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
              <p className="text-sm text-danger mb-6">{error}</p>
              <Link to="/" className="btn-secondary inline-block">Go home</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
