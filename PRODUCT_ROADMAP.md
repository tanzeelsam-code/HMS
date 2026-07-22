# NexusHOS product roadmap

This roadmap turns the competitor benchmark into an execution sequence. “Implemented” means the capability works in this repository; it does not imply vendor certification or production compliance.

## Release 1 — commercial and automation spine (implemented)

- Public, responsive direct-booking engine with aggregated inventory, server-held quotes, transactional allocation, unique confirmation codes, and idempotent retries.
- Secure browser sessions, scrypt passwords, session expiry, login/API/booking throttling, hardened API responses, request IDs, explicit CORS origins, authentication evidence, and controlled production bootstrap.
- General-Manager account lifecycle, property assignments, disable/reactivate, session revocation, strong temporary-password issuance, and mandatory first-login rotation.
- Versioned workflow templates, risk classification, manager approvals, safe replay, task queues, manual dispatch, immutable run evidence, transactional event outbox, expiring leases, and continuous production processing.
- HMAC-chained append-only audit events, chain verification, encrypted webhook signing secrets, subscription controls, delivery evidence, SSRF protection, crash reclamation, bounded retries, and continuous/operator processing.
- Persisted organization/property memberships, portfolio snapshots, inventory-holding group blocks, reputation approvals, and membership-scoped ESG action requests.
- OpenAPI 3.1 discovery, a live developer/readiness portal, authenticated event catalog, and webhook signature quick-start.
- Online SQLite snapshots with immediate integrity verification and a separate read-only restore-artifact check.
- Existing PMS, folio, GL, Night Audit, procurement, POS, maintenance, role redaction, and deterministic copilot safeguards.

## Release 2 — production foundation (next)

- Migrate operational data to PostgreSQL with organization/brand/property keys on every row and enforced tenant isolation.
- Add formal forward-only migrations, point-in-time recovery, restore drills, a distributed queue/worker tier, caching, structured logs, traces, metrics, alerts, and SLOs.
- Add invitations and recovery delivery, MFA/passkeys, OIDC/SAML SSO, SCIM, session/device controls, custom roles/scopes, approval separation, and privacy retention/export/deletion.
- Add OAuth applications, sandbox properties, operator webhook replay, SDK generation, URI versioning, API lifecycle policy, and integration certification tests.

## Release 3 — money and acquisition

- Integrate a PCI-isolated payment provider: tokenization, payment intents, deposits, pre-authorization, incremental authorization, capture, refund, wallets, 3DS/SCA, terminals, virtual cards, payout reconciliation, fraud, and disputes.
- Certify the PMS against SiteMinder before building individual OTA connectors; implement room/rate mapping, ARI/restrictions, reservation modifications/cancellations, retries, dead letters, reconciliation, commissions, parity checks, and connector health.
- Extend direct booking with rate plans, packages, promotions, upsells, multi-room carts, languages, currencies, taxes, metasearch attribution, abandonment recovery, content/media, accessibility, and payment checkout.

## Release 4 — complete hotel operations

- Reservation amendments, room moves, waitlists, controlled overbooking, split/routed folios, company/agency profiles, negotiated rates, commissions, AR/city ledger, e-signature, identity verification, room-ready assignment, day-use, and non-room inventory.
- Offline-first staff application with push sync, smart housekeeping assignment, inspections/photos, handovers/chat, lost and found, linen, minibar, assets, preventive maintenance, parts, warranties, meters, and fair workload optimization.
- Full groups/MICE: leads/RFPs, rooming lists, contracts, deposits, concessions, catering, function spaces, equipment, BEOs, pickup/wash, and transient displacement.
- App-free guest journey with preregistration, consented identity, messaging inbox, human handoff, service requests, upsell fulfillment, digital keys, kiosks, tipping, and privacy-first preference memory.

## Release 5 — decision and profit operating system

- Semantic metrics layer, custom/scheduled reporting, budgets, forecast variance, net RevPAR, TRevPAR, GOPPAR, acquisition cost, cost-to-serve, guest lifetime value, portfolio consolidation, and warehouse export.
- RMS with pickup/pace, segments, cancellation/no-show models, compset/events/search signals, elasticity, LOS/restriction/overbooking optimization, confidence, backtesting, drift monitoring, guarded publishing, and rollback.
- Operational digital twin for group acceptance, outages, occupancy spikes, staffing, energy, inventory, guest impact, and profit scenarios.
- Explainable permissioned agents that show evidence, confidence, policy, financial effect, approval requirement, execution result, and reversal path.
- No-code marketplace for workflows, connectors, and agents, backed by stable APIs and certified event contracts.

## External prerequisites

The following cannot be honestly completed with source code alone: payment merchant onboarding, OTA/SiteMinder certification, SMS/WhatsApp accounts, lock-vendor credentials, review-platform approval, BMS/IoT access, tax/fiscal registrations, SSO identity-provider configuration, production hosting, and compliance audits. The application should return a clear “provider not configured” state until each prerequisite is supplied.
