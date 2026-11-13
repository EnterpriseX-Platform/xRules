/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root in dev; set NEXT_PUBLIC_BASE_PATH at build time to serve under a sub-path (UAT: /xrules).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  output: 'standalone',
  // monorepo: trace dependencies from the repo root so hoisted node_modules land in the standalone bundle
  experimental: { outputFileTracingRoot: require('path').join(__dirname, '../../') },
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
