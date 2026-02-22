/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/xrules',
  async rewrites() {
    return [
      // Proxy to Rust Engine
      {
        source: '/proxy/engine/:path*',
        destination: 'http://localhost:50051/:path*',
      },
    ]
  },
}

module.exports = nextConfig
