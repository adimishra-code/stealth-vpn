import { useState } from 'react'
import { Link } from 'react-router'
import { useForgotPasswordMutation } from '../features/auth/authApi'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [forgot, { isLoading }] = useForgotPasswordMutation()

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await forgot({ email }).unwrap()
      setSent(true)
    } catch {
      // always show success to avoid email enumeration
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card text-center py-10">
          <div className="text-4xl mb-4">📧</div>
          <h1 className="text-xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-sm text-slate-400 mb-6">
            If an account exists for {email}, a reset link is on its way.
          </p>
          <Link to="/login" className="btn-secondary inline-block">Back to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <h1 className="text-2xl font-bold text-white mb-1">Forgot password</h1>
        <p className="text-sm text-slate-400 mb-6">We'll email you a reset link.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button type="submit" disabled={isLoading} className="btn-primary w-full disabled:opacity-50">
            {isLoading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-400">
          Remembered it? <Link to="/login" className="text-stealth-300 hover:text-stealth-400">Log in</Link>
        </p>
      </div>
    </div>
  )
}
