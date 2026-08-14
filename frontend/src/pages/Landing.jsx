import { Link } from 'react-router'
import { useSelector } from 'react-redux'
import {
  Radar, Zap, MapPin, KeyRound, MonitorSmartphone, Repeat,
  Check, ArrowRight, EyeOff, Gauge, Lock,
} from 'lucide-react'
import { selectToken } from '../features/auth/authSlice'
import Reveal from '../components/Reveal'
import { useScrollAnimation } from '../hooks/useScrollAnimation'

const features = [
  {
    icon: Radar,
    title: 'Anti-DPI stealth',
    desc: 'XTLS-Reality + Vision cloaks your traffic as plain HTTPS to Microsoft servers. From the outside, it is indistinguishable from a normal TLS 1.3 session.',
  },
  {
    icon: Zap,
    title: 'Gaming mode',
    desc: 'Pure kernel WireGuard with only +2–4ms overhead. Choose your mode manually based on your network environment.',
  },
  {
    icon: MapPin,
    title: 'India-first servers',
    desc: 'Mumbai node at sub-25ms for Indian users. Frankfurt exit for international streaming and EU gaming.',
  },
  {
    icon: KeyRound,
    title: 'Your keys, encrypted',
    desc: 'AES-256-GCM encrypted keys at rest. Zero content logging — we never see what you browse. Kill switch blocks leaks if the tunnel ever drops.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Works everywhere',
    desc: 'Native WireGuard config + QR codes. Windows, macOS, Android, iOS, Linux — one click setup.',
  },
  {
    icon: Repeat,
    title: 'Manual mode switch',
    desc: 'Gaming (WireGuard UDP) or Stealth (XTLS-Reality). Pick what fits your network environment — one tap in the dashboard.',
  },
]

const plans = [
  { name: 'Basic', inr: '₹99', usd: '$1.99', devices: '1 device', speed: '500 GB/mo', highlight: false },
  { name: 'Pro', inr: '₹199', usd: '$3.99', devices: '3 devices', speed: 'Unlimited', highlight: true },
  { name: 'Team', inr: '₹499', usd: '$9.99', devices: '10 devices', speed: 'Unlimited', highlight: false },
]

const stats = [
  { icon: Gauge, value: '+2ms', label: 'gaming overhead' },
  { icon: Zap, value: '<25ms', label: 'India ping' },
  { icon: EyeOff, value: '0', label: 'content logs' },
]

function Brand() {
  return (
    <Link to="/" className="glow-accent">
      <span className="font-mono font-semibold text-[15px] tracking-tight text-ink">
        stealth<span className="text-accent-400">vpn</span>
      </span>
    </Link>
  )
}

export default function Landing() {
  const token = useSelector(selectToken)
  useScrollAnimation()
  const ctaTo = token ? '/dashboard' : '/register'
  const ctaLabel = token ? 'Open dashboard' : 'Get started'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-void/95">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            {token ? (
              <Link to="/dashboard" className="btn-primary !py-1.5 !px-4 text-sm">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm text-muted hover:text-ink px-3 py-2 transition-colors duration-fast">Log in</Link>
                <Link to="/register" className="btn-primary !py-1.5 !px-4 text-sm">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden noise">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          {/* Subtle radial from centre — no grid, no gradient headline */}
          <div className="absolute top-[-16rem] left-1/2 -translate-x-1/2 w-[52rem] h-[52rem] rounded-full bg-accent-400/[0.07] blur-[120px]" />
        </div>

        <div className="max-w-4xl mx-auto px-4 pt-28 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-400/20 bg-accent-400/5 text-accent-300 font-mono text-xs tracking-widest shadow-[0_0_12px_rgba(45,212,191,0.1)] mb-8 animate-fade-up">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-glow-pulse inline-block" />
            XTLS-REALITY · CLIENT = CHROME · SNI = MICROSOFT.COM
          </div>

          {/* Plain white headline — one accent word, no gradient */}
          <h1 className="font-display text-6xl lg:text-7xl xl:text-8xl font-bold text-ink leading-[1.05] tracking-tight mb-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
            Encrypted. Cloaked.
            <br />
            <span className="text-accent-400">Untraceable.</span>
          </h1>

          <p className="text-lg text-muted max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up" style={{ animationDelay: '200ms' }}>
            StealthVPN looks like a normal HTTPS connection to your ISP. Browse freely,
            play games at pro ping, and stay invisible — even under government-level
            deep packet inspection.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: '300ms' }}>
            <Link to={ctaTo} className="btn-primary px-7 py-3 text-base group">
              {ctaLabel}
              <ArrowRight size={18} className="transition-transform duration-fast group-hover:translate-x-0.5" />
            </Link>
            <a href="#pricing" className="btn-secondary px-7 py-3 text-base">See pricing</a>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: '400ms' }}>
            {stats.map((s) => (
              <div
                key={s.label}
                className="group relative p-6 rounded-xl bg-surface border border-line shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-200 cursor-default"
              >
                <s.icon size={18} className="text-accent-400/60 group-hover:text-accent-400 transition-colors duration-200 mx-auto mb-3" strokeWidth={1.75} />
                <div className="text-4xl font-bold text-ink tabular-nums text-center">{s.value}</div>
                <div className="text-xs text-muted uppercase tracking-widest mt-1 text-center">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">Built to stay invisible</h2>
            <p className="text-muted mt-3 max-w-xl mx-auto">
              Every layer is designed around one goal: your traffic should look like nothing at all.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 100}>
              <div className="group h-full relative p-6 rounded-xl bg-surface border border-line shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:border-accent-400/20 hover:-translate-y-1 transition-all duration-200">
                {/* Icon only — no box, no coloured tile */}
                <f.icon size={22} className="text-accent-400 mb-4 transition-transform duration-200 group-hover:scale-110" strokeWidth={1.75} />
                <h3 className="font-semibold text-ink mb-2">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-20 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-ink tracking-tight">Simple pricing</h2>
            <p className="text-muted mt-3">Cancel anytime. No content logging — connection metadata is retained as required under Indian IT law (CERT-In).</p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto items-start">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 120}>
              <div
                className={`relative p-8 rounded-2xl transition-all duration-200 ${
                  p.highlight
                    ? 'bg-surface border-2 border-accent-400/40 shadow-[var(--shadow-card-hover),var(--shadow-glow-accent)] scale-[1.03] hover:scale-[1.05] hover:shadow-[var(--shadow-card-hover),var(--shadow-glow-accent-strong)] z-10'
                    : 'bg-surface border border-line shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 hover:border-accent-400/20'
                }`}
              >
                {p.highlight && (
                  <>
                    {/* Top accent stripe */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-400 to-transparent rounded-t-2xl" />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent-400 text-void text-xs font-bold rounded-full tracking-wide whitespace-nowrap shadow-[var(--shadow-glow-accent)]">
                      MOST POPULAR
                    </div>
                  </>
                )}
                <h3 className="font-display text-lg font-semibold text-ink">{p.name}</h3>
                <div className="mt-6 mb-6">
                  <span className="text-5xl font-bold text-ink tracking-tight tabular-nums">{p.inr}</span>
                  <span className="text-sm text-muted">/month</span>
                  <div className="font-mono text-xs text-faint mt-1">{p.usd} for international</div>
                </div>
                <ul className="space-y-2.5 text-sm text-muted mb-8">
                  {[p.devices, p.speed, 'All server locations', 'Stealth + Gaming modes'].map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <Check size={15} className="text-accent-400 shrink-0" strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to={token ? '/billing' : '/register'}
                  className={`${p.highlight ? 'btn-primary' : 'btn-secondary'} w-full`}
                >
                  Choose {p.name}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Lock size={14} className="text-faint" strokeWidth={1.75} />
            <span className="font-mono text-[13px] text-muted">
              stealth<span className="text-accent-400">vpn</span>
            </span>
          </div>

          <nav className="flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted hover:text-ink transition-colors duration-fast">Features</a>
            <a href="#pricing" className="text-muted hover:text-ink transition-colors duration-fast">Pricing</a>
            <Link to="/login" className="text-muted hover:text-ink transition-colors duration-fast">Log in</Link>
          </nav>

          <nav className="flex items-center gap-4 text-xs">
            <Link to="/terms" className="text-faint hover:text-ink transition-colors duration-fast">Terms</Link>
            <Link to="/privacy" className="text-faint hover:text-ink transition-colors duration-fast">Privacy</Link>
          </nav>

          <p className="font-mono text-[11px] text-faint">
            No content logs · CERT-In retention applies to metadata only
          </p>
        </div>
      </footer>
    </div>
  )
}
