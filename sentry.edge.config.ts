import * as Sentry from '@sentry/nextjs';

// Edge runtime (middleware). Inert until SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0,
});
