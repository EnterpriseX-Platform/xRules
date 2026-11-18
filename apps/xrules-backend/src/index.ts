import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startScheduler } from './data/dataflow.service.js';
import { startWorkers } from './platform/queue.js';
import { startTriggerScheduler } from './platform/triggers.js';
import './platform/bulk.js';
import './platform/ml.js';                 // registers the ml.train queue handler

// JSON has no BigInt: raw SQL counts (count(*)) come back as BigInt
(BigInt.prototype as any).toJSON = function () { return Number(this); };

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
// Clients behind firewalls that refuse PUT/PATCH/DELETE send POST + X-HTTP-Method-Override (Studio always does).
app.use((req, _res, next) => {
  const o = String(req.headers['x-http-method-override'] || '').toUpperCase();
  if (req.method === 'POST' && (o === 'PUT' || o === 'PATCH' || o === 'DELETE')) req.method = o;
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'xrules-backend', timestamp: new Date().toISOString() });
});

// API routes
app.use('/', routes);

// Error handler
app.use(errorHandler);

// Start server
// First admin: created once from ADMIN_EMAIL / ADMIN_PASSWORD when that email has no account yet
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim(); const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const { prisma } = await import('./config/database.js');
  const found = await prisma.user.findUnique({ where: { email } });
  if (found) { if (!found.isSystemAdmin) await prisma.user.update({ where: { email }, data: { isSystemAdmin: true } }); return; }
  const { signup } = await import('./services/users.service.js');
  await signup({ email, password, name: 'Admin', workspaceName: process.env.ADMIN_WORKSPACE || 'xRules' } as any, { bypassSwitch: true });
  await prisma.user.update({ where: { email }, data: { isSystemAdmin: true } });
  console.log(`Admin account created: ${email}`);
}
ensureAdmin().catch(e => console.error('Admin bootstrap failed:', e.message));

app.listen(env.port, () => {
  // XRULES_BACKGROUND=off: serve the API only (no schedules, no queue workers) — for debug copies and read replicas
  if (process.env.XRULES_BACKGROUND !== 'off') { startScheduler(); startWorkers(); }
  startTriggerScheduler();
  console.log(`[xrules-backend] Running on http://localhost:${env.port}`);
  console.log(`[xrules-backend] Engine Hub: ${env.engineHubUrl}`);
  console.log(`[xrules-backend] Environment: ${env.nodeEnv}`);
});

export default app;
