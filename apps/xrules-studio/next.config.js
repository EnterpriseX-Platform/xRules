/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root in dev; set NEXT_PUBLIC_BASE_PATH at build time to serve under a sub-path (UAT: /xrules).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  output: 'standalone',
  // monorepo: trace dependencies from the repo root so hoisted node_modules land in the standalone bundle
  experimental: { outputFileTracingRoot: require('path').join(__dirname, '../../') },
  reactStrictMode: true,
  // Short URLs. Pages still live under app/(app)/projects/[projectId]; organization-level pages use the
  // internal project names _integration / _all. Old URLs redirect to the new ones.
  async rewrites() {
    const HUB = '/projects/_integration', ALL = '/projects/_all';
    return {
      beforeFiles: [
        { source: '/connections', destination: `${HUB}/integrations/connections` },
        { source: '/apis', destination: `${HUB}/apis` },
        { source: '/apis/:id', destination: `${HUB}/apis/:id` },
        { source: '/triggers', destination: `${HUB}/triggers` },
        { source: '/data-sets', destination: `${HUB}/data-sets` },
        { source: '/data-sets/:id', destination: `${HUB}/data-sets/:id` },
        { source: '/tests', destination: `${ALL}/tests` },
        { source: '/test-runs', destination: `${ALL}/test-runs` },
        { source: '/approvals', destination: `${ALL}/approvals` },
        { source: '/monitor', destination: `${ALL}/monitor` },
        { source: '/monitor/:sub', destination: `${ALL}/monitor/:sub` },
        { source: '/executions', destination: `${ALL}/executions` },
        { source: '/executions/:id', destination: `${ALL}/executions/:id` },
        { source: '/settings', destination: '/settings/tenant' },
        { source: '/settings/members', destination: '/settings/tenant' },
        { source: '/settings/roles', destination: '/settings/tenant' },
        { source: '/settings/api-keys', destination: `${HUB}/integrations/api-keys` },
        { source: '/settings/webhooks', destination: `${HUB}/integrations/webhooks` },
        { source: '/settings/audit', destination: `${ALL}/audit` },
        { source: '/admin/:tab(orgs|users|settings)', destination: '/admin' },
        { source: '/p/:project', destination: '/projects/:project' },
        { source: '/p/:project/:path*', destination: '/projects/:project/:path*' },
      ],
    };
  },
  async redirects() {
    const r = (source, destination) => ({ source, destination, permanent: false });
    return [
      r('/p/:id(_integration|_all)/:path*', '/projects/:id/:path*'),
      r('/projects/_integration/integrations/connections', '/connections'),
      r('/projects/_integration/integrations/api-keys', '/settings/api-keys'),
      r('/projects/_integration/integrations/webhooks', '/settings/webhooks'),
      r('/projects/_integration/:path*', '/:path*'),
      r('/projects/_all/audit', '/settings/audit'),
      r('/projects/_all/:path*', '/:path*'),
      r('/settings/tenant', '/settings'),
      r('/admin', '/admin/orgs'),
      r('/projects/:id((?!_)[^/]+)', '/p/:id'),
      r('/projects/:id((?!_)[^/]+)/:path*', '/p/:id/:path*'),
    ];
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
