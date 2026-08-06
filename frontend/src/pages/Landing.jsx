import { Link } from 'react-router'
import { useSelector } from 'react-redux'
import { selectToken } from '../features/auth/authSlice'

const features = [
  {
    icon: '🛰️',
    title: 'Anti-DPI stealth',
    desc: 'XTLS-Reality + Vision cloaks your traffic as plain HTTPS to Microsoft servers. GFW ML classifiers can\'t tell you apart from a normal browser.',
  },
  {
    icon: '⚡',
    title: 'Gaming mode',
    desc: 'Pure kernel WireGuard, +2–4ms overhead. Auto-detects DPI-free networks and switches from stealth for minimum ping in Valorant and CS2.',
  },
  {
    icon: '🇮🇳',
    title: 'India-first servers',
    desc: 'Mumbai node at sub-25ms for Indian users. Frankfurt exit for international streaming and EU gaming.',
  },
  {
    icon: '🔑',
    title: 'Your keys, encrypted',
    desc: 'AES-256-GCM encrypted keys at rest. Zero content logging — we never see what you browse. Kill switch blocks leaks if the tunnel ever drops.',
  },
  {
    icon: '📱',
    title: 'Works everywhere',
    desc: 'Native WireGuard config + QR codes. Windows, macOS, Android, iOS, Linux — one click setup.',
  },
  {
    icon: '🔄',
    title: 'Smart fallback',
    desc: 'Gaming → Stealth → obfs4 auto-detection. If UDP is blocked, we automatically drop to TLS-443 TCP obfuscation.',
  },
]

const plans = [
  {
    name: 'Basic',
    inr: '₹99',
    usd: '$1.99',
    per: '/month',
    devices: '1 device',
    speed: '10 Mbps',
    highlight: false,
  },
  {
    name: 'Pro',
    inr: '₹199',
    usd: '$3.99',
    per: '/month',
    devices: '3 devices',
    speed: 'Unlimited',
    highlight: true,
  },
  {
    name: 'Team',
    inr: '₹499',
    usd: '$9.99',
    per: '/month',
    devices: '10 devices',
    speed: 'Unlimited',
    highlight: false,
  },
]

export default function Landing() {
  const token = useSelector(selectToken)
  const cta = token ? (
    <Link to="/dashboard" className="btn-primary px-8 py-3 text-lg">Open dashboard</Link>
  ) : (
    <Link to="/register" className="btn-primary px-8 py-3 text-lg">Get started free</Link>
  )

  return (
    <div className="min-h-screen bg-stealth-950">
      <header className="border-b border-stealth-700/50 bg-stealth-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white text-lg">
            <span className="w-8 h-8 rounded-lg bg-stealth-500 flex items-center justify-center">🛡</span>
            StealthVPN
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-400 hover:text-white">Log in</Link>
            <Link to="/register" className="btn-primary !py-1.5 !px-3 text-sm">Sign up</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-stealth-800/60 border border-stealth-700/50 rounded-full px-4 py-1.5 text-xs text-stealth-300 mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Defeats 2026 GFW ML classifiers
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6">
          Encrypted. Cloaked.
          <br />
          <span className="text-stealth-400">Unrestricted.</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
          StealthVPN looks like a normal HTTPS connection to your ISP. Browse freely,
          play games at pro ping, and stay invisible — even under government-level
          deep packet inspection.
        </p>
        {cta}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div className="card text-center py-6">
            <div className="text-3xl font-bold text-white">+2ms</div>
            <div className="text-sm text-slate-400">gaming overhead</div>
          </div>
          <div className="card text-center py-6">
            <div className="text-3xl font-bold text-white">&lt;25ms</div>
            <div className="text-sm text-slate-400">India ping</div>
          </div>
          <div className="card text-center py-6">
            <div className="text-3xl font-bold text-white">0</div>
            <div className="text-sm text-slate-400">content logs</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Why StealthVPN</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="card hover:border-stealth-500/50 transition-colors">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Simple pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`card relative ${p.highlight ? 'border-stealth-500 ring-2 ring-stealth-500/30' : ''}`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-stealth-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </span>
              )}
              <h3 className="text-lg font-bold text-white">{p.name}</h3>
              <div className="mt-3 mb-6">
                <span className="text-4xl font-extrabold text-white">{p.inr}</span>
                <span className="text-sm text-slate-500">{p.per}</span>
                <div className="text-xs text-slate-500 mt-1">{p.usd} for international</div>
              </div>
              <ul className="space-y-2 text-sm text-slate-400 mb-8">
                <li>✓ {p.devices}</li>
                <li>✓ {p.speed}</li>
                <li>✓ All server locations</li>
                <li>✓ Stealth + Gaming modes</li>
              </ul>
              <Link
                to={token ? '/billing' : '/register'}
                className={`${p.highlight ? 'btn-primary' : 'btn-secondary'} w-full text-center inline-block`}
              >
                Choose {p.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="card py-12">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to go stealth?</h2>
          <p className="text-slate-400 mb-8">Join thousands of users who browse and game without limits.</p>
          {cta}
        </div>
      </section>

      <footer className="border-t border-stealth-700/50 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} StealthVPN — No content logs. No browsing history. Ever.
      </footer>
    </div>
  )
}
