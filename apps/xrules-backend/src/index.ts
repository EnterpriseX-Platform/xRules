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

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'xrules-backend', timestamp: new Date().toISOString() });
});

// API routes
app.use('/', routes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(env.port, () => {
  // XRULES_BACKGROUND=off: serve the API only (no schedules, no queue workers) — for debug copies and read replicas
  if (process.env.XRULES_BACKGROUND !== 'off') { startScheduler(); startWorkers(); }
  startTriggerScheduler();
  console.log(`[xrules-backend] Running on http://localhost:${env.port}`);
  console.log(`[xrules-backend] Engine Hub: ${env.engineHubUrl}`);
  console.log(`[xrules-backend] Environment: ${env.nodeEnv}`);
});

export default app;
