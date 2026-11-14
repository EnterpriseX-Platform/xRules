import { chromium, type FullConfig } from '@playwright/test';
export default async function (config: FullConfig) {
  const base = config.projects[0].use.baseURL as string;
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(base + 'login');
  await p.locator('input[type=email]').fill(process.env.XR_EMAIL || 'admin@example.com');
  await p.locator('input[type=password]').fill(process.env.XR_PASSWORD || 'admin123');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 30_000 });
  await p.context().storageState({ path: '.auth.json' });
  await b.close();
}
