# Tests

Vitest unit tests for security-critical paths.

## Run

```bash
npm test               # one-shot run
npm run test:watch     # watch mode while developing
npm run test:coverage  # with coverage report
```

## What's covered

- **`lib/htmlEscape.test.ts`** — HTML escaping (defends feedback-form injection).
- **`platform/rateLimit.test.ts`** — rate limiter fails *closed* by default (regression
  test for the Tier 0 fix). Verifies 429 with Retry-After, 503 on RPC error, and
  the explicit `RATE_LIMIT_LENIENT=true` opt-out.
- **`platform/rateLimitHelpers.test.ts`** — client IP extraction and email
  normalization helpers.
- **`lib/orderHistory.test.ts`** — audit-log writer throws on auth failure / insert
  failure instead of swallowing silently (regression test for Tier 0 fix).

## What's not covered (yet)

- RLS policies — these run inside Postgres, not unit-testable. Smoke-test in
  Supabase or set up an integration test DB.
- Next.js route handlers end-to-end — would need request mocking + auth
  scaffolding. Add per-feature when the feature is non-trivial (NetSuite sync
  is a good candidate).

## Adding a test

1. Put it under `tests/` mirroring the source path.
2. Import production code via the `@/` alias (configured in `vitest.config.ts`).
3. Use `tests/helpers/mockSupabase.ts` for a fluent Supabase mock; pass `rpc`
   handlers and per-table `tableResults`.
