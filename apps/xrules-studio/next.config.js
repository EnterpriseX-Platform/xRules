/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root in dev; set NEXT_PUBLIC_BASE_PATH at build time to serve under a sub-path (UAT: /xrules).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
