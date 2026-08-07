import { Link } from 'react-router'
import PropTypes from 'prop-types'
import { ShieldCheck, ShieldAlert, ShieldOff, Zap, EyeOff } from 'lucide-react'

// The single question a VPN dashboard must answer above the fold:
// am I protected right now? Everything else is secondary.
export default function ProtectionStatus({ devices, plan, daysLeft }) {
  const active = devices.filter((d) => d.isActive)
  const hasPlan = plan && plan !== 'free'
  const expiringSoon = hasPlan && daysLeft <= 3

  const state = !hasPlan
    ? {
        tone: 'danger',
        Icon: ShieldOff,
        title: 'Not protected',
        detail: 'Subscribe to provision an encrypted tunnel.',
        cta: { to: '/billing', label: 'Choose a plan' },
      }
    : active.length === 0
      ? {
          tone: 'warn',
          Icon: ShieldAlert,
          title: 'No active devices',
          detail: 'Your plan is live — add a device to start tunnelling.',
        }
      : expiringSoon
        ? {
            tone: 'warn',
            Icon: ShieldAlert,
            title: 'Protected — renew soon',
            detail: `${active.length} device${active.length > 1 ? 's' : ''} cloaked · expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
            cta: { to: '/billing', label: 'Renew' },
          }
        : {
            tone: 'ok',
            Icon: ShieldCheck,
            title: 'Protected',
            detail: `${active.length} device${active.length > 1 ? 's' : ''} cloaked · ${daysLeft} days remaining.`,
          }

  const tones = {
    ok: { text: 'text-ok', dot: 'bg-ok', iconWrap: 'border-ok/30 bg-ok/10', latch: true },
    warn: { text: 'text-warn', dot: 'bg-warn', iconWrap: 'border-warn/30 bg-warn/10', latch: false },
    danger: { text: 'text-danger', dot: 'bg-danger', iconWrap: 'border-danger/30 bg-danger/10', latch: false },
  }
  const t = tones[state.tone]
  const { Icon } = state

  const stealthCount = active.filter((d) => d.mode === 'stealth').length
  const gamingCount = active.filter((d) => d.mode === 'gaming').length

  return (
    <section className="card overflow-hidden animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="relative shrink-0">
          {/* Signature: "The Latch" — when protection engages, a ring of
              light contracts into the shield like a lock seating. One-shot,
              plays only on the transition into the green state. */}
          {t.latch && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-2xl border-2 border-ok animate-latch"
            />
          )}
          <div className={`relative w-[4.5rem] h-[4.5rem] rounded-2xl border ${t.iconWrap} flex items-center justify-center`}>
            <Icon size={34} className={t.text} strokeWidth={1.75} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${t.dot}`} />
            <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">{state.title}</h1>
          </div>
          <p className="text-sm text-muted">{state.detail}</p>

          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {stealthCount > 0 && (
                <span className="chip-accent">
                  <EyeOff size={12} />
                  {stealthCount} stealth
                </span>
              )}
              {gamingCount > 0 && (
                <span className="chip-warn">
                  <Zap size={12} />
                  {gamingCount} gaming
                </span>
              )}
              <span className="chip-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                AES-256-GCM
              </span>
            </div>
          )}
        </div>

        {state.cta && (
          <Link to={state.cta.to} className="btn-primary shrink-0 self-start sm:self-center">
            {state.cta.label}
          </Link>
        )}
      </div>
    </section>
  )
}

ProtectionStatus.propTypes = {
  devices: PropTypes.arrayOf(PropTypes.object).isRequired,
  plan: PropTypes.string,
  daysLeft: PropTypes.number.isRequired,
}
