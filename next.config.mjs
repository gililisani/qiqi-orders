import { withSentryConfig } from '@sentry/nextjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this repo — a stray lockfile elsewhere on the
  // machine otherwise makes Next guess the wrong workspace root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  eslint: {
    // Backlog worked down to zero 2026-08-04 — lint now gates the build.
    ignoreDuringBuilds: false,
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
