import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDispatch } from 'react-redux'
import { useLoginMutation } from '../features/auth/authApi'
import { setCredentials } from '../features/auth/authSlice'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [login, { isLoading }] = useLoginMutation()
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await login({ email, password }).unwrap()
      dispatch(setCredentials(res))
      navigate('/dashboard')
    } catch (err) {
      setError(err.data?.error || 'Login failed')
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
        <p className="text-sm text-slate-400 mb-6">Log in to your StealthVPN account</p>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

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
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={isLoading} className="btn-primary w-full disabled:opacity-50">
            {isLoading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <div className="mt-5 flex justify-between text-sm">
          <Link to="/forgot-password" className="text-stealth-300 hover:text-stealth-400">Forgot password?</Link>
          <Link to="/register" className="text-stealth-300 hover:text-stealth-400">Create account</Link>
        </div>
      </div>
    </div>
  )
}
