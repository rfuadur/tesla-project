import type { NextConfig } from 'next';

// Where the Express API lives, as seen from the Next.js server.
// Read at BUILD time (next.config is baked into the standalone server), so Docker passes it as a build arg.
const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // A self-contained server (.next/standalone/server.js) for a small Docker image.
  output: 'standalone',
  poweredByHeader: false,

  // The browser only ever talks to this origin. /api/* is proxied to the Express API, so the session
  // cookie is first-party and no CORS setup is needed (docs/architecture.md).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },

  // Basic browser protections on every page (the API sets its own on /api/*). A full script-limiting
  // Content-Security-Policy needs per-request nonces for Next's inline scripts: a known limitation.
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }, // no clickjacking
          { key: 'X-Frame-Options', value: 'DENY' }, // the same, for older browsers
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
