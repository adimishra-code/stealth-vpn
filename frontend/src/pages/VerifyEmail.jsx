import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useVerifyEmailMutation } from '../features/auth/authApi'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [verify, { isLoading }] = useVerifyEmailMutation()
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
  }, [token])

  return (
    <div className="max-w-md mx-auto">
      <div className="card text-center py-10">
        {status === 'verifying' && (
          <>
            <div className="text-4xl mb-4">⏳</div>
            <h1 className="text-xl font-bold text-white">Verifying your email...</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-xl font-bold text-white mb-2">Email verified!</h1>
            <p className="text-sm text-slate-400 mb-6">Your account is ready.</p>
            <Link to="/login" className="btn-primary inline-block">Log in</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-white mb-2">Verification failed</h1>
            <p className="text-sm text-rose-400 mb-6">{error}</p>
            <Link to="/" className="btn-secondary inline-block">Go home</Link>
          </>
        )}
      </div>
    </div>
  )
}
