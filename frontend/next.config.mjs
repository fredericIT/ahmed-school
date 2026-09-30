/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  // The browser talks to the API through this origin, so auth cookies are first-party
  // and middleware can see them.
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
      { source: '/api/docs', destination: `${backend}/api/docs/` },
      { source: '/api/docs/:path*', destination: `${backend}/api/docs/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
