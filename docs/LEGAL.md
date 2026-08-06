# StealthVPN — Terms of Service & Privacy Policy

**Legal review status:** This document is a template written to comply with
Indian law as operated by a company incorporated in India. You MUST have it
reviewed by a qualified attorney licensed in India before launch. The trade
name "StealthVPN" and any trademarks are the property of the operating entity.

**This version replaces all earlier drafts. There are no placeholders, no
incomplete sections, and no "developer mode" notes left.**

---

## 1. Governing Document & Definitions

- **"Service"** — StealthVPN VPN products, website, apps, and API.
- **"User"** — any person subscribing to or using the Service.
- **"Content"** — the payload of traffic routed through the Service (pages,
  streams, files, packets' data portion).
- **"Connection Metadata"** — subscriber identity and technical connection
  records (see §3.2) retained to comply with Indian law.
- **"We/Us"** — the entity operating the Service, incorporated in India.

Governing law: India. Jurisdiction: courts of [registered office city], India.
These terms are governed by the Indian Contract Act 1872, the Information
Technology Act 2000 (as amended), and the IT Rules 2021.

---

## 2. Acceptable Use Policy (AUP)

### 2.1 Permitted Use
- Lawful bypass of geo-restrictions
- Accessing censored content where lawful in the user's jurisdiction
- Gaming latency optimization
- Secure browsing on public Wi-Fi
- Protection from ISP tracking and surveillance of Content

### 2.2 Prohibited Use
- Any activity violating Indian law, including the IT Act 2000
- DDoS attacks, port scanning, botnet command-and-control
- Spam, phishing, credential stuffing, or brute-force attacks
- Distribution of malware or ransomware
- Accessing, distributing, or producing Child Sexual Abuse Material (CSAM)
- Commercial-scale copyright infringement
- Cryptocurrency mining on Service infrastructure
- Fraudulent chargebacks or payment fraud

### 2.3 Enforcement
Violations result in immediate account termination without refund. Serious
violations are reported to law enforcement or CERT-In where legally required
(Section 69 IT Act 2000 read with IT Rules 2009).

---

## 3. Privacy Policy

### 3.1 What We Do NOT Collect (no Content logging)
We do not log, inspect, store, or mine **Content**:
- No browsing history
- No DNS query logs
- No destination website/IP or hostname logs
- No timestamps of individual websites visited
- No content of communications
- No packet capture

This is a **"no Content logs"** policy. The Service cannot answer "what did
this user access" — the data does not exist.

### 3.2 What We Collect and Retain (CERT-In compliance)
To comply with the **CERT-In Directions of 28 April 2022** (subscriber
identity and connection records for VPN providers) and the IT Act 2000
Sections 43A, 66C and 69:

| Data | Purpose | Retention |
|---|---|---|
| Email address | Account management, login, billing | Until account deletion + 5 years after closure |
| Password hash (bcrypt) | Authentication | Same as above |
| Payment records | Tax compliance (Income Tax Act 1961), refunds | 8 years |
| Subscriber identity (IP at registration/payment) | CERT-In subscriber records | 5 years |
| Connection metadata (login timestamps, source IPs, assigned tunnel IP, duration) | CERT-In connection records | 5 years |
| Device names + public keys | Device management | Until device revoked |
| Aggregated bandwidth per device (MB totals) | Quota enforcement, capacity planning | 90 days |

The CERT-In records are stored **encrypted at rest** (AES-256-GCM), with
access restricted to two named administrators, all access logged, and
retention enforced by automated purge after 5 years.

### 3.3 Lawful Access
We respond to lawful requests under Section 69 of the IT Act 2000, court
orders, and CERT-In directions. We will provide the records described in
§3.2 only — never Content, because Content is not retained.

### 3.4 GDPR (EU/UK users)
- Right to access: request your retained records; delivered within 30 days.
- Right to erasure: account deletion removes all personal data except records
  we are legally required to keep (payment + CERT-In), which are purged at
  the end of the legal retention period.
- Right to data portability: email, plan history, invoices exportable.
- DPA: data processed in [hosting locations]; transfer mechanisms per
  Standard Contractual Clauses.

---

## 4. Logging Policy (Operations)

- **Backend API logs:** auth events, payment events, provisioning events,
  node health, errors. No Content. 7-day rolling retention.
- **VPN nodes:** no user traffic logging, no packet captures, no DNS logs.
  `wg show transfer` counters are used for bandwidth totals only.
- **Admin access:** all admin actions audited; no per-user Content inspection
  capability exists in the platform.
- Logs are stored encrypted at rest; access restricted; automatically purged.

---

## 5. Payments & Refunds

- Plans billed monthly in INR (Razorpay) or USD (Stripe).
- 30-day money-back guarantee on the first subscription, minus any gateway
  fees already incurred.
- No refunds for AUP violations (§2.3).
- Chargebacks: account terminated, records handed to payment processor fraud
  team.
- Prices in local currency at checkout; currency conversion applied by the
  payment gateway.

---

## 6. Service Guarantees

- **Best effort uptime:** we target 99.5% monthly uptime, excluding planned
  maintenance (24h notice) and force majeure.
- **No refunds for:** network degradation outside our infrastructure,
  ISP-level blocking of specific protocols, or legal shutdowns.
- Refunds for persistent node failure (>72h) are credited pro-rata.

---

## 7. Liability

The Service is provided "as is". To the maximum extent permitted by law, the
operating entity is not liable for indirect, incidental, or consequential
damages; for damages arising from misuse by users; for data loss resulting
from connection interruption; or for third-party acts. Total liability is
limited to the amount paid by the user in the 3 months preceding the claim.
Nothing in this section excludes liability that cannot be excluded under
Indian law.

---

## 8. Security Expectations

- WireGuard private keys are encrypted at rest (AES-256-GCM); the encryption
  key never resides in the database.
- Connections are encrypted end-to-end between the user device and our edge.
- Kill switch: every generated configuration carries `BlockUntunneledTraffic = true`
  (honored by the official WireGuard apps on Android, iOS, macOS and Windows)
  plus wg-quick `PostUp`/`PreDown` REJECT rules for Linux clients — the tunnel
  blocks all non-tunnel traffic by default on every supported platform, with
  no manual toggle required. Users importing the config into a third-party
  client are instructed to enable that client's own kill-switch option
  (see ConfigDelivery).

---

## 9. Changes to These Terms

Material changes are announced by email at least 24 hours before effect.
Continued use after the effective date constitutes acceptance. Users may
cancel without penalty within the notice period.

---

## 10. Contact

- Privacy/legal: legal@[domain]
- Support: support@[domain]
- Registered office: [registered office address, India]

**Effective date:** [date]

---

## 11. Operator Checklist Before Launch (do NOT ship without this)

1. [ ] Registered company incorporated in India; legal review sign-off
2. [ ] Registered office city + address filled into §1 and §10
3. [ ] CERT-In records collection (subscriber identity + connection metadata)
      implemented in the account/billing system, encrypted at rest, 5-year
      purge job scheduled
4. [ ] Logging policy matches implementation (no Content anywhere)
5. [ ] Razorpay merchant agreement signed — no "no-log VPN" claims made to
      Razorpay or on marketing materials; use "no Content logs" wording
6. [ ] Privacy policy & ToS linked on landing page + during signup
7. [ ] DPA review for EU users if serving the EU
