import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint exists for editors/CI (`npm run lint`), but years of pre-lint
    // code means gating deploys on it would block main today. Tighten
    // after the backlog is worked down.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Required on Next 14 for instrumentation.ts (Sentry) to load.
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // Pinned to OUR Supabase project — a wildcard here turns /_next/image
        // into an open proxy for any Supabase tenant's public storage.
        hostname: 'aqlkrplhzstkrexyhskl.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  transpilePackages: ['@react-pdf/renderer'],
  // WP9 — baseline security headers. Referrer-Policy is the sharp edge:
  // password-setup tokens ride in /set-password?token=... URLs and must
  // never leak via the Referer header. A full CSP needs nonce plumbing
  // through Next's inline scripts — deferred, tracked in the fix plan.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

// Sentry build wrapper: injects the client config and (only when
// SENTRY_AUTH_TOKEN is set) uploads source maps. Without the token it's a
// pass-through.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
});
