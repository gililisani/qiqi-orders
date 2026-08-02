import * as Sentry from '@sentry/nextjs';

// Inert until SENTRY_DSN is set in the environment (Vercel → Settings →
// Environment Variables). Errors only — no performance tracing.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  // Most known failure modes in this codebase are `console.error` + continue
  // (swallowed Stripe/webhook/history writes). Capture those so silent
  // failures finally surface somewhere.
  integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
});
