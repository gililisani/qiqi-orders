import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
};

// Sentry build wrapper: injects the client config and (only when
// SENTRY_AUTH_TOKEN is set) uploads source maps. Without the token it's a
// pass-through.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
});
