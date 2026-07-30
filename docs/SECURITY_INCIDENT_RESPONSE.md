# Qiqi INC — Security Incident Response Plan

**Owner / Incident Lead:** Gili Lisani (company principal)
**Applies to:** the Qiqi Hub (order-management system), its database (Supabase), hosting (Vercel), file storage (AWS S3), and all third-party data it processes — including Amazon Selling Partner data ("Amazon Information") and NetSuite data.
**Last reviewed:** 2026-07-29
**Review cadence:** every 6 months (January / July), or immediately after any incident or major architecture change.

## 1. What counts as a security incident

- Unauthorized access (or reasonable suspicion of it) to the Hub, the database, hosting accounts, or any connected service (Amazon SP-API, NetSuite, Microsoft Graph, AWS, Stripe).
- Leaked, exposed, or stolen credentials: API keys, tokens, passwords, service-role keys.
- Data exposure: any Amazon Information, customer, or partner data readable by an unauthorized party.
- Malicious code, dependency compromise, or defacement of the deployed application.

## 2. Roles

| Role | Person | Duties |
|---|---|---|
| Incident Lead | Gili Lisani | Detection triage, containment decisions, all notifications, post-incident review |
| Technical response | Gili Lisani (with engineering/AI-agent support) | Credential rotation, log analysis, patching, verification |

## 3. Response procedure

1. **Contain (immediately):** revoke/rotate the affected credentials at the provider (Vercel env vars, Supabase keys, Amazon LWA refresh token via Seller Central "Authorize" revocation, NetSuite token, AWS IAM). Disable affected admin/client users in the Hub if account compromise is suspected.
2. **Assess (within hours):** determine what data was accessible, over what window, using provider logs (Vercel, Supabase, AWS CloudTrail, NetSuite login audit).
3. **Notify (within 24 hours of detection):**
   - **Amazon:** any incident involving Amazon Information is reported to **security@amazon.com within 24 hours of detection**, including scope, data involved, containment steps, and contact details.
   - Other affected parties (partners, customers, providers) as applicable and as required by law.
4. **Eradicate & recover:** patch the vulnerability, redeploy, restore data from Supabase backups if integrity is affected, re-issue credentials.
5. **Post-incident review (within 1 week):** written summary — root cause, timeline, fixes, and any control changes. Stored in this repository under `docs/`.

## 4. Standing security controls (summary)

- **Hosting/network:** fully managed cloud (Vercel, Supabase, AWS) — provider-managed firewalls, DDoS protection, and network isolation; no self-managed servers. Database access is segmented: browser clients pass Row-Level Security; privileged access only via server-side service role.
- **Access control:** per-user accounts with role separation (admin vs client) and per-area permissions; least-privilege by default.
- **Encryption:** TLS for all data in transit; provider-managed encryption at rest (Supabase/AWS).
- **Authentication policy:** minimum 12-character passwords with special characters, leaked-password screening (HaveIBeenPwned), TOTP multi-factor authentication for admin users, credentials rotated at least annually (365-day maximum lifetime).
- **Secrets handling:** credentials live only in environment variables (Vercel) and git-ignored local env files; never in code, never in public repositories, never shared between individuals.
- **Data minimization:** the Hub does not collect or store Amazon buyer personally identifiable information.
