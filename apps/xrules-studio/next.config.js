/** @type {import('next').NextConfig} */
const nextConfig = {
  // basePath disabled for v2 — Studio runs at root.
  // To deploy under a sub-path (e.g. /studio), set NEXT_PUBLIC_BASE_PATH and re-enable below.
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
