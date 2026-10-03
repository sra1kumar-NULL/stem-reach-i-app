---
name: security
description: Use when handling auth, tokens, user or student data, tenant/org boundaries, authorization checks, input validation, secrets, Supabase RLS, client token storage, rate limiting, or reviewing a change for vulnerabilities (OWASP Top 10 / API / MASVS).
---

# Security

This app handles real data about minors — student accounts, per-student performance, teacher
accounts. Assume both an unauthenticated attacker and a motivated logged-in student.

## Checklist

### 1. Authentication

- Every route touching user data is authenticated. New routes default to *not* authenticated until
  proven otherwise.
- Tokens are **verified**, not merely decoded, and expiry and revocation are handled.
- Supabase Auth is the identity provider. The API does not roll its own password handling.

### 2. Authorization — the critical class of bug

- Every read and every write checks that the caller is permitted **this specific row**.
- Role and org come from the verified token. Never from `req.body`, a query parameter, a header
  the client sets freely, or a route the client chooses.
- A student cannot read or modify another student's submissions, progress, or performance.
- A teacher cannot reach another teacher's or another org's data.
- Check both directions: can A read B, and can A write B? Also check that absence is 404/403 rather
  than an error that confirms the row exists.
- When adding an endpoint, ask what a hostile logged-in student could point it at.

### 3. Tenant isolation

Multi-tenant organizations are an upcoming milestone. Every business table needs `org_id` and every
query needs it scoped. Put the scoping in a shared helper in `core/` so a new endpoint cannot forget
it, and never accept an `org_id` from the client.

### 4. Input validation and injection

- Zod validates every boundary: body, query, params, headers, env, and the seed CLI's JSON.
- All SQL goes through Drizzle's parameterized query builder. No string-built SQL, ever — including
  in scripts and ordering/filter clauses.
- No `eval`, no dynamic function construction, no shell execution of user input.
- File paths, redirect targets, and URLs are validated, not assumed. Never interpolate a
  client-supplied value into a path.

### 5. Data exposure

- Responses exclude password hashes, tokens, `service_role` keys, and internal cross-tenant ids.
- List endpoints return only the fields the screen needs.
- Logs and error responses contain no tokens, no full PII, and no raw database errors.
- Never echo a database or auth error message verbatim to the client.

### 6. Supabase RLS

RLS is defense-in-depth behind a privileged API role. Verify policies match the intended access
model rather than merely existing. A policy that is present but wrong is worse than none, because
it looks reviewed.

### 7. Secrets

- Secrets live in `api/.env`, which is gitignored. `.env.example` holds placeholders only.
- Never commit keys, tokens, or connection strings. Never paste a real secret into a report, a
  test fixture, a log line, or a chat message — reference the variable name instead.
- `dummy-creds.json` exists for demo accounts and must never hold real credentials.

### 8. Client storage and transport

- Tokens are stored using the platform's secure storage, not plain AsyncStorage, if the app
  currently holds them anywhere sensitive.
- Nothing sensitive is written to device logs or unencrypted storage.
- All traffic is HTTPS in production.

### 9. Abuse and rate limiting

Signup, submission, activation, and report endpoints are currently unbounded. A student can spam
submissions to brute-force correct answers, or call signup to create accounts. Flag these, and rate
limit before the pilot reaches real classrooms.

## Standards to apply

- OWASP Top 10: broken access control first — it is the realistic risk here.
- OWASP API Security: broken object-level authorization, broken function-level authorization,
  excessive data exposure, missing rate limiting.
- For the mobile client: OWASP MASVS — secure storage, no sensitive data in logs, certificate
  handling.

## Reporting

For each finding give severity (`critical` / `high` / `medium` / `low`), `file:line`, concrete
attacker steps, impact, and the smallest correct fix. Anything that could expose one student's data
to another is `critical` regardless of how unlikely. Redact secrets in the report.
