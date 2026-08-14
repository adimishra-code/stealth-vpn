import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router'
import { selectUser, clearCredentials } from '../features/auth/authSlice'
import { useLogoutAllMutation, useTotpSetupMutation, useTotpVerifyMutation, useTotpDisableMutation } from '../features/auth/authApi'
import { Mail, UserCog, KeyRound, ShieldCheck, MonitorX, AlertTriangle, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from '../lib/toast'
import ConfirmModal from '../components/ConfirmModal'

export default function Settings() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [logoutAll, { isLoading }] = useLogoutAllMutation()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState(null)

  const isAdmin = user?.role === 'admin'
  const [totpOn, setTotpOn] = useState(!!user?.totpEnabled)
  const [setupData, setSetupData] = useState(null) // { secret, otpauth }
  const [code, setCode] = useState('')
  const [totpMsg, setTotpMsg] = useState(null)
  const [totpError, setTotpError] = useState(null)
  const [totpBusy, setTotpBusy] = useState(false)
  const [totpSetup, totpSetupState] = useTotpSetupMutation()
  const [totpVerify] = useTotpVerifyMutation()
  const [totpDisable] = useTotpDisableMutation()

  const handleTotpSetup = async () => {
    setTotpMsg(null)
    setTotpError(null)
    try {
      const data = await totpSetup().unwrap()
      setSetupData(data)
    } catch (err) {
      setTotpError(err.data?.error || 'Setup failed')
    }
  }

  const handleTotpVerify = async () => {
    setTotpError(null)
    setTotpBusy(true)
    try {
      await totpVerify({ totpCode: code }).unwrap()
      setSetupData(null)
      setCode('')
      setTotpOn(true)
      setTotpMsg('Two-factor authentication enabled.')
    } catch (err) {
      setTotpError(err.data?.error || 'Invalid code')
    } finally {
      setTotpBusy(false)
    }
  }

  const handleTotpDisable = async () => {
    setTotpError(null)
    setTotpBusy(true)
    try {
      await totpDisable({ totpCode: code }).unwrap()
      setCode('')
      setTotpOn(false)
      setTotpMsg('Two-factor authentication disabled.')
    } catch (err) {
      setTotpError(err.data?.error || 'Invalid code')
    } finally {
      setTotpBusy(false)
    }
  }

  const handleLogoutAll = async () => {
    setResult(null)
    try {
      await logoutAll().unwrap()
      // logout-all wipes refresh tokens server-side and clears the cookie,
      // but the in-memory access token on THIS device is still valid until
      // its 15-minute expiry. Clear Redux + redirect so the user lands on
      // /login and the next request 401s cleanly.
      dispatch(clearCredentials())
      navigate('/login')
    } catch {
      toast.error('Sign-out failed. Try again.')
    }
    setConfirming(false)
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Settings</h1>
        <p className="text-sm text-muted mt-1">Account preferences</p>
      </div>

      <div className="card animate-fade-up">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">Account</h2>
        <div className="text-sm text-muted space-y-3">
          <p className="flex items-center gap-2">
            <Mail size={14} className="text-faint" />
            <span className="text-faint">Email:</span> <span className="text-ink font-mono">{user?.email}</span>
          </p>
          <p className="flex items-center gap-2">
            <UserCog size={14} className="text-faint" />
            <span className="text-faint">Role:</span> <span className="text-ink capitalize">{user?.role}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full ml-1.5" />
            <span className="text-faint">Email verified:</span>{' '}
            {user?.emailVerified ? <span className="text-ok font-medium">Yes</span> : <span className="text-warn font-medium">No</span>}
          </p>
        </div>
      </div>

      <div className="card animate-fade-up" style={{ animationDelay: '80ms' }}>
        <h2 className="font-display text-lg font-semibold text-ink mb-4 flex items-center gap-2">
          <KeyRound size={16} className="text-faint" />
          Change password
        </h2>
        <button
          disabled
          className="btn-primary text-sm opacity-50 cursor-not-allowed"
          title="Coming soon"
        >
          Change password (coming soon)
        </button>
        <p className="text-xs text-faint mt-3">
          Password reset is available from the login screen via &quot;Forgot password&quot;.
        </p>
      </div>

      {isAdmin && (
        <div className="card animate-fade-up" style={{ animationDelay: '120ms' }}>
          <h2 className="font-display text-lg font-semibold text-ink mb-2 flex items-center gap-2">
            <ShieldCheck size={16} className="text-faint" />
            Two-factor authentication
          </h2>
          <p className="text-sm text-muted mb-4">
            {totpOn
              ? 'Enabled — a 6-digit code is required at every login.'
              : 'Add a time-based one-time password (TOTP) as a second factor on your admin login.'}
          </p>

          {totpMsg && <p className="text-sm text-ok mb-4">{totpMsg}</p>}
          {totpError && <p className="text-sm text-danger mb-4">{totpError}</p>}

          {!totpOn && !setupData && (
            <button
              onClick={handleTotpSetup}
              disabled={totpSetupState.isLoading}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {totpSetupState.isLoading && <Loader2 size={14} className="animate-spin" />}
              {totpSetupState.isLoading ? 'Generating…' : 'Enable two-factor'}
            </button>
          )}

          {setupData && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-5">
                <QRCodeSVG value={setupData.otpauth} size={180} />
                <p className="text-[11px] text-ink">Scan with your authenticator app</p>
                <p className="text-[11px] text-ink">or enter the secret manually:</p>
                <code className="font-mono text-xs text-ink break-all">{setupData.secret}</code>
              </div>
              <div>
                <label className="label" htmlFor="totp-setup-code">Enter the 6-digit code from the app</label>
                <input
                  id="totp-setup-code"
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  className="input font-mono tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleTotpVerify} disabled={totpBusy || code.length !== 6} className="btn-primary text-sm disabled:opacity-50">
                  {totpBusy && <Loader2 size={14} className="animate-spin" />}
                  Activate
                </button>
                <button onClick={() => setSetupData(null)} disabled={totpBusy} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {totpOn && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <label className="label" htmlFor="totp-disable-code">Current code to disable</label>
                <input
                  id="totp-disable-code"
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  className="input font-mono tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                />
              </div>
              <button onClick={handleTotpDisable} disabled={totpBusy || code.length !== 6} className="btn-danger text-sm disabled:opacity-50">
                {totpBusy && <Loader2 size={14} className="animate-spin" />}
                Disable two-factor
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="font-display text-lg font-semibold text-ink mb-2 flex items-center gap-2">
          <MonitorX size={16} className="text-faint" />
          Sessions
        </h2>
        <p className="text-sm text-muted mb-4">
          Sign out every device at once. Useful when you lost a device or suspect someone else
          has your credentials — all sessions are revoked immediately.
        </p>
        <button onClick={() => setConfirming(true)} disabled={isLoading} className="btn-secondary text-sm">
          {isLoading ? 'Signing out…' : 'Sign out all devices'}
        </button>
        {result && <p className={`text-sm mt-3 ${result.startsWith('Sign-out') ? 'text-danger' : 'text-ok'}`}>{result}</p>}
      </div>

      <div className="card border-danger/30 animate-fade-up" style={{ animationDelay: '160ms' }}>
        <h2 className="font-display text-lg font-semibold text-ink mb-2 text-danger flex items-center gap-2">
          <AlertTriangle size={16} />
          Danger zone
        </h2>
        <p className="text-sm text-muted mb-4">
          Schedules your account for deletion after a 7-day grace period. During that window
          you can contact support to cancel; afterwards your account and data are removed
          permanently.
        </p>
        <button disabled className="btn-danger text-sm opacity-50" title="Coming soon">
          Delete account
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          title="Sign out all devices?"
          message="Every signed-in device will be logged out, including this one on its next token refresh."
          confirmLabel="Sign out all"
          danger
          loading={isLoading}
          onConfirm={handleLogoutAll}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
