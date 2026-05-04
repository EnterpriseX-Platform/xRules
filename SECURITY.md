# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in XRules, **please do not open a public GitHub issue**. Instead, send an email to `security@xrules.dev` (placeholder; replace with the project maintainer's address) with:

- A description of the vulnerability
- Steps to reproduce
- Affected versions
- Any proof-of-concept code or screenshots

We will acknowledge receipt within **3 business days**, work with you on a patch, and credit you in the release notes (unless you prefer to remain anonymous).

## Disclosure timeline

We follow **coordinated disclosure**:

| Day | Action |
|---|---|
| 0 | Report received, triage begins |
| 1–3 | Severity assessed, contact established |
| 7–30 | Fix developed and tested |
| 30 | Patched release published |
| 30+ | Public advisory + CVE assigned (if applicable) |

Severe vulnerabilities (RCE, auth bypass, data exfiltration) may be patched faster.

## Supported Versions

Only the **latest minor release** receives security patches.

| Version | Supported |
|---|---|
| 0.x (current) | ✅ |
| Older | ❌ — please upgrade |

## Hardening recommendations for self-hosted deployments

- Always set `JWT_SECRET` and `CONNECTION_ENC_KEY` to fresh 32-byte random values
- Run behind a reverse proxy (nginx / Caddy / Cloudflare) with TLS
- Enable PostgreSQL `ssl=on` for connections crossing the network
- Restrict the studio UI behind authentication or VPN if you run a public-facing engine
- Set `RATE_LIMIT_*` env vars to protect against runaway clients
- Rotate API Keys periodically; use scope `execute` only (never `admin`) for runtime callers

## Threat model in scope

- Network-borne attacks against the studio, backend, or engine HTTP/gRPC ports
- Privilege escalation via crafted rule definitions or flow graphs
- SSRF via flow nodes that fetch URLs (mitigated via `CONNECTIONS_HTTP_ALLOWLIST`)
- Secret leakage via execution traces or logs
- Denial of service via complex rule definitions or large payloads

## Out of scope

- Vulnerabilities in third-party dependencies (please report upstream)
- Issues that require physical access to the host
- Social-engineering attacks against contributors
