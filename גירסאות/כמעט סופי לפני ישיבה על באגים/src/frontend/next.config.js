/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  distDir: ".next-runtime",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path((?!auth/).*)',
        destination: 'http://localhost:3001/api/:path*', // Other API routes to backend
      },
    ];
  },
};

module.exports = nextConfig;
