import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useResetPasswordMutation } from '../features/auth/authApi'

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

  if (done) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card text-center py-10">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-white mb-2">Password updated</h1>
          <p className="text-sm text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <h1 className="text-2xl font-bold text-white mb-6">Set new password</h1>
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input
              type="password"
              required
              minLength={8}
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
            />
          </div>
          <button type="submit" disabled={isLoading} className="btn-primary w-full disabled:opacity-50">
            {isLoading ? 'Updating...' : 'Update password'}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-400">
          <Link to="/login" className="text-stealth-300 hover:text-stealth-400">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
