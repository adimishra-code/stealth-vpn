import { Link } from 'react-router'
import PropTypes from 'prop-types'

// Mirrors docs/LEGAL.md §1, §2, §5–§10 (Terms of Service). Keep in sync.
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

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 animate-fade-up">
      <div className="mb-10">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted mt-2">Effective as of the current published version of docs/LEGAL.md</p>
        <p className="text-xs text-faint mt-3">
          This is a template document. The operator must have it reviewed by qualified counsel
          before offering the service.
        </p>
      </div>

      <Section num={1} title="Definitions">
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li><span className="text-ink">Service</span> — the VPN product, website, apps, and API.</li>
          <li><span className="text-ink">User</span> — any person subscribing to or using the Service.</li>
          <li><span className="text-ink">Content</span> — the payload of traffic routed through the Service.</li>
          <li><span className="text-ink">We/Us</span> — the entity operating the Service.</li>
        </ul>
        <p className="text-sm text-muted mt-3">Governing law: India — Indian Contract Act 1872, Information Technology Act 2000 (as amended), and the IT Rules 2021.</p>
      </Section>

      <Section num={2} title="Acceptable Use Policy">
        <h3 className="text-sm font-semibold text-ink mt-4 mb-2">Permitted use</h3>
        <ul className="text-sm text-muted space-y-1.5 list-disc pl-5">
          <li>Lawful bypass of geo-restrictions</li>
          <li>Accessing censored content where lawful in the user&apos;s jurisdiction</li>
          <li>Secure browsing on public Wi-Fi</li>
          <li>Protection from ISP tracking of Content</li>
        </ul>
        <h3 className="text-sm font-semibold text-ink mt-4 mb-2">Prohibited use</h3>
        <ul className="text-sm text-muted space-y-1.5 list-disc pl-5">
          <li>Any activity violating Indian law, including the IT Act 2000</li>
          <li>DDoS attacks, port scanning, botnet command-and-control</li>
          <li>Spam, phishing, credential stuffing, brute-force attacks</li>
          <li>Distribution of malware or ransomware</li>
          <li>Accessing, distributing, or producing CSAM</li>
          <li>Commercial-scale copyright infringement</li>
          <li>Fraudulent chargebacks or payment fraud</li>
        </ul>
        <p className="text-sm text-muted mt-3">Violations result in immediate account termination without refund. Serious violations are reported to law enforcement or CERT-In where legally required (Section 69, IT Act 2000).</p>      </Section>

      <Section num={3} title="Payments & Refunds">
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li>Plans are billed in advance per billing cycle.</li>
          <li>Refunds follow the payment gateway&apos;s and operator&apos;s published refund policy.</li>
          <li>Fraudulent chargebacks terminate the account.</li>
        </ul>
      </Section>

      <Section num={4} title="Service Guarantees">
        <p className="text-sm text-muted">
          The Service is provided on an &quot;as is&quot; basis. No uptime or latency guarantee is
          implied; performance depends on shared infrastructure and networks we do not control.
        </p>
      </Section>

      <Section num={5} title="Liability">
        <p className="text-sm text-muted">
          To the maximum extent permitted by law, the operator is not liable for indirect,
          incidental, or consequential damages, including data loss, arising from use of the
          Service. The operator&apos;s total liability is limited to amounts paid in the twelve
          months preceding the claim.
        </p>
      </Section>

      <Section num={6} title="Security Expectations">
        <p className="text-sm text-muted">
          The operator uses modern transport encryption (TLS, WireGuard, Xray) and industry
          password hashing, but no system is immune to compromise. Users are responsible for
          protecting their credentials and devices.
        </p>
      </Section>

      <Section num={7} title="Changes to These Terms">
        <p className="text-sm text-muted">
          Terms may be updated; continued use after changes take effect constitutes acceptance.
          Material changes are announced in-app and by email.
        </p>
      </Section>

      <Section num={8} title="Contact">
        <p className="text-sm text-muted">
          Questions: see the contact details published in the operator&apos;s docs/LEGAL.md.
        </p>
      </Section>

      <p className="text-xs text-faint mt-12">
        <Link to="/privacy" className="text-accent-300 hover:text-accent-200">Privacy policy</Link> ·{' '}
        <Link to="/" className="text-accent-300 hover:text-accent-200">Back to home</Link>
      </p>
    </div>
  )
}
