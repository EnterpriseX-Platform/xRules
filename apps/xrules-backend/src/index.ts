import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

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
  console.log(`[xrules-backend] Running on http://localhost:${env.port}`);
  console.log(`[xrules-backend] Engine Hub: ${env.engineHubUrl}`);
  console.log(`[xrules-backend] Environment: ${env.nodeEnv}`);
});

export default app;
