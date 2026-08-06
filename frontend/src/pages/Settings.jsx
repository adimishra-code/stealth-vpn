import { useState } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../features/auth/authSlice'

export default function Settings() {
  const user = useSelector(selectUser)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [msg, setMsg] = useState(null)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setMsg({ type: 'info', text: 'Password change requires login session — coming in next release.' })
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Account preferences</p>
      </div>

      <div className="card">
        <h2 className="font-bold text-white mb-4">Account</h2>
        <div className="text-sm text-slate-400 space-y-2">
          <p><span className="text-slate-500">Email:</span> <span className="text-white">{user?.email}</span></p>
          <p>
            <span className="text-slate-500">Email verified:</span>{' '}
            {user?.emailVerified ? <span className="text-emerald-400">Yes</span> : <span className="text-amber-400">No</span>}
          </p>
          <p><span className="text-slate-500">Role:</span> <span className="text-white capitalize">{user?.role}</span></p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-bold text-white mb-4">Change password</h2>
        {msg && (
          <div className={`text-sm rounded-lg p-3 mb-4 ${msg.type === 'info' ? 'bg-stealth-800 text-slate-300' : ''}`}>
            {msg.text}
          </div>
        )}
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <button type="submit" className="btn-primary text-sm">Update password</button>
        </form>
      </div>

      <div className="card border-rose-500/30">
        <h2 className="font-bold text-white mb-2 text-rose-400">Danger zone</h2>
        <p className="text-sm text-slate-400 mb-4">
          Deleting your account immediately revokes all devices and removes your data.
        </p>
        <button disabled className="btn-danger text-sm opacity-50" title="Coming soon">
          Delete account
        </button>
      </div>
    </div>
  )
}
