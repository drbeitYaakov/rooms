/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  distDir: ".next-runtime",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://rooms-ma9h.onrender.com',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path((?!auth/).*)',
        destination: 'https://rooms-ma9h.onrender.com/api/:path*', // Other API routes to backend
      },
    ];
  },
};

module.exports = nextConfig;
