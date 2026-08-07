import { Link } from 'react-router'
import PropTypes from 'prop-types'

// Mirrors docs/LEGAL.md §3–§4 (Privacy Policy + Logging Policy). Keep in sync.
function Section({ num, title, children }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-ink mt-10 mb-3">
        {num}. {title}
      </h2>
      {children}
    </section>
  )
}

Section.propTypes = {
  num: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 animate-fade-up">
      <div className="mb-10">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted mt-2">Effective as of the current published version of docs/LEGAL.md</p>
      </div>

      <Section num={1} title="No Content logging">
        <p className="text-sm text-muted">
          We do not log, inspect, store, or mine the Content of your traffic: no browsing
          history, no DNS query logs, no destination hostname or IP logs, no packet capture.
          The Service cannot answer &quot;what did this user access&quot; — the data does not exist.
        </p>
      </Section>

      <Section num={2} title="What we collect and retain">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-muted border border-line rounded-lg">
            <thead>
              <tr className="text-left text-faint border-b border-line">
                <th className="p-2.5 font-medium">Data</th>
                <th className="p-2.5 font-medium">Purpose</th>
                <th className="p-2.5 font-medium">Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line/60"><td className="p-2.5">Email address</td><td className="p-2.5">Account, login, billing</td><td className="p-2.5">Until account deletion</td></tr>
              <tr className="border-b border-line/60"><td className="p-2.5">Password hash (bcrypt, cost 12)</td><td className="p-2.5">Authentication</td><td className="p-2.5">Until account deletion</td></tr>
              <tr className="border-b border-line/60"><td className="p-2.5">Payment gateway customer references</td><td className="p-2.5">Billing, refunds</td><td className="p-2.5">Until account deletion</td></tr>
              <tr className="border-b border-line/60"><td className="p-2.5">Invoices (plan, amount, status, dates)</td><td className="p-2.5">Billing history</td><td className="p-2.5">Until account deletion</td></tr>
              <tr className="border-b border-line/60"><td className="p-2.5">Device names, WireGuard public keys, assigned tunnel IP, node</td><td className="p-2.5">Device management, quota</td><td className="p-2.5">Until the device is revoked</td></tr>
              <tr className="border-b border-line/60"><td className="p-2.5">Bandwidth totals per device (MB)</td><td className="p-2.5">Quota enforcement</td><td className="p-2.5">90 days rolling</td></tr>
              <tr><td className="p-2.5">Refresh-token digests (SHA-256)</td><td className="p-2.5">Session management</td><td className="p-2.5">Until logout / deletion</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint mt-4">
          CERT-In statement: the platform does not currently collect connection records and does
          not assert CERT-In compliance. Data in MongoDB is not encrypted at rest by default;
          all transport is TLS.
        </p>
      </Section>

      <Section num={3} title="Lawful access">
        <p className="text-sm text-muted">
          We respond to lawful requests under Section 69 of the IT Act 2000, court orders, and
          CERT-In directions — providing only the records described above, never Content,
          because Content is not retained.
        </p>
      </Section>

      <Section num={4} title="Your rights">
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li><span className="text-ink">Erasure</span> — the settings page lets you delete your account: every device is revoked immediately, sessions invalidated, and the account, devices and invoices are permanently purged after a 14-day grace period.</li>
          <li><span className="text-ink">Access</span> — request your retained records; delivered within 30 days.</li>
          <li><span className="text-ink">Portability</span> — email, plan history, and invoices are exportable.</li>
        </ul>
      </Section>

      <Section num={5} title="Operational logging">
        <p className="text-sm text-muted">
          Server logs record authentication, payment, and provisioning events (not Content), and
          network access logs deliberately exclude query strings. Logs are retained on a rolling
          basis and are accessible only to the operator.
        </p>
      </Section>

      <p className="text-xs text-faint mt-12">
        <Link to="/terms" className="text-accent-300 hover:text-accent-200">Terms of service</Link> ·{' '}
        <Link to="/" className="text-accent-300 hover:text-accent-200">Back to home</Link>
      </p>
    </div>
  )
}
