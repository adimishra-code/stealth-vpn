import { useSelector } from 'react-redux'
import { Link } from 'react-router'
import { selectUser } from '../features/auth/authSlice'
import { useListInvoicesQuery } from '../features/payment/paymentApi'
import { Check, Lock, ShieldCheck, Clock, ArrowRight } from 'lucide-react'

const plans = [
  {
    id: 'free',
    title: 'Free (Locked)',
    price: '₹0',
    cycle: 'month',
    subtitle: 'Default registration tier',
    features: [
      '0 devices (locked)',
      'Key generation disabled',
      '0 allowed devices',
      'Encrypted tunnel blocked',
      'Requires administrator approval',
    ],
    highlight: false,
    badge: 'DEFAULT',
  },
  {
    id: 'pro',
    title: 'Pro (Friends Network)',
    price: 'Free',
    cycle: 'invite-only',
    subtitle: 'Administrator approved friends',
    features: [
      'Max 2 devices',
      '100 Mbps max speed',
      'Strict limit: 2 devices',
      'Monthly 30-day access cycle',
      'WireGuard & XTLS-Reality modes',
      'All worldwide server nodes',
    ],
    highlight: true,
    badge: 'EXCLUSIVE',
  },
]

const statusStyles = {
  paid: 'chip-ok',
  pending: 'chip-warn',
  failed: 'chip-danger',
  refunded: 'chip-muted',
  abandoned: 'chip-muted',
}

export default function Billing() {
  const user = useSelector(selectUser)
  const { data: invoicesData, isLoading: invoicesLoading, isError: invoicesError, refetch } = useListInvoicesQuery()

  const invoices = invoicesData?.invoices || []
  const isApproved = user?.role === 'admin' || !!user?.isApproved
  const hasActivePro = isApproved && user?.plan === 'pro' && user?.planExpiresAt && new Date(user.planExpiresAt) > new Date()
  const isExpired = user?.planExpiresAt && new Date(user.planExpiresAt) <= new Date()

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Access & Membership</h1>
        <p className="text-sm text-muted mt-1">
          Review your private network access tier, connection limits, and status.
        </p>
      </div>

      {/* Active Membership Status Card */}
      <div className="card border-line-strong p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-faint uppercase tracking-wider">Current Tier:</span>
            <span className="font-mono font-bold uppercase text-accent-400 text-base px-2.5 py-0.5 rounded-sm bg-accent-400/10 border border-accent-400/30">
              {user?.plan || 'FREE'}
            </span>
            {hasActivePro ? (
              <span className="chip-ok flex items-center gap-1">
                <ShieldCheck size={12} />
                ACTIVE
              </span>
            ) : !isApproved ? (
              <span className="chip-danger flex items-center gap-1">
                <Lock size={12} />
                PENDING APPROVAL
              </span>
            ) : isExpired ? (
              <span className="chip-warn flex items-center gap-1">
                <Clock size={12} />
                EXPIRED
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-2 max-w-xl leading-relaxed">
            {hasActivePro ? (
              <span>
                Your <strong>Pro</strong> access is active through{' '}
                <strong className="text-ink font-mono">{new Date(user.planExpiresAt).toLocaleDateString()}</strong>.
                You can generate keys for up to <strong>2 devices</strong> at up to <strong>100 Mbps</strong> max speed.
              </span>
            ) : !isApproved ? (
              <span>
                Your account is currently on the locked <strong>Free tier</strong>. An administrator must accept and approve your account before you can generate VPN keys or establish connections.
              </span>
            ) : isExpired ? (
              <span className="text-warn">
                Your 30-day Pro cycle has expired. Head to your dashboard to submit a one-click reactivation request for administrator renewal.
              </span>
            ) : (
              <span>Free tier — key generation is disabled until administrator approval.</span>
            )}
          </p>
        </div>

        <Link
          to="/dashboard"
          className="btn-primary text-xs flex items-center gap-1.5 self-start md:self-center shrink-0"
        >
          <span>Go to Dashboard</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl items-start">
        {plans.map((p, i) => {
          const isUserCurrent = p.id === (user?.plan || 'free')

          return (
            <div
              key={p.id}
              className={`relative p-8 rounded-2xl animate-fade-up transition-all duration-200 ${
                p.highlight
                  ? 'bg-surface border-2 border-accent-400/40 shadow-[var(--shadow-card-hover),var(--shadow-glow-accent)] scale-[1.02] hover:scale-[1.04] z-10'
                  : 'bg-surface border border-line shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]'
              }`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {p.badge && (
                <>
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-400 to-transparent rounded-t-2xl" />
                  <div
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold rounded-full tracking-wide whitespace-nowrap ${
                      p.highlight
                        ? 'bg-accent-400 text-void shadow-[var(--shadow-glow-accent)]'
                        : 'bg-raised text-faint border border-line'
                    }`}
                  >
                    {p.badge}
                  </div>
                </>
              )}

              {isUserCurrent && (
                <span className="absolute top-3.5 right-4 chip-muted">
                  <Check size={11} className="text-accent-400" />
                  current
                </span>
              )}

              <h3 className="font-display text-lg font-semibold text-ink">{p.title}</h3>
              <div className="mt-6 mb-6">
                <span className="text-5xl font-bold text-ink tracking-tight tabular-nums">{p.price}</span>
                <span className="text-sm text-muted">/{p.cycle}</span>
                <div className="font-mono text-xs text-faint mt-1">{p.subtitle}</div>
              </div>

              <ul className="space-y-2.5 text-sm text-muted mb-7">
                {p.features.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <Check size={14} className={p.highlight ? 'text-accent-400' : 'text-faint'} strokeWidth={2.5} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/dashboard"
                className={`w-full text-center text-xs py-2 block font-medium rounded-lg transition-all ${
                  p.highlight ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {isUserCurrent ? 'Current Plan' : 'Go to Dashboard'}
              </Link>
            </div>
          )
        })}
      </div>

      {/* Invoice History or Notice */}
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink mb-2">Billing & Invoices</h2>
        <p className="text-xs text-muted mb-4">
          StealthVPN operates as a 100% private, free network for friends. There are no subscription fees or checkout charges.
        </p>

        {invoicesLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
          </div>
        ) : invoicesError ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-danger">Failed to load billing history.</p>
            <button onClick={refetch} className="btn-secondary text-xs shrink-0">Retry</button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-4 rounded-lg bg-raised/30 border border-line text-xs text-faint">
            No billing records — all access is complimentary for approved friends.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-faint border-b border-line">
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Date</th>
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Plan</th>
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Amount</th>
                  <th className="pb-3 pr-4 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Gateway</th>
                  <th className="pb-3 font-mono text-2xs uppercase tracking-[0.15em] font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id} className="border-b border-line/60 last:border-0 transition-colors duration-fast hover:bg-raised/50">
                    <td className="py-3.5 pr-4 text-muted">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="py-3.5 pr-4 font-mono uppercase text-ink">{inv.plan}</td>
                    <td className="py-3.5 pr-4 font-mono text-ink">
                      {inv.currency === 'USD' ? '$' : '₹'}{(inv.amount / 100).toFixed(2)}{' '}
                      <span className="text-faint">{inv.currency}</span>
                    </td>
                    <td className="py-3.5 pr-4 capitalize text-muted">{inv.gateway}</td>
                    <td className="py-3.5">
                      <span className={statusStyles[inv.status]}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}