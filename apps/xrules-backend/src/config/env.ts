import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://xrules:xrules_secret@localhost:5433/xrulesdb',
  jwtSecret: process.env.JWT_SECRET || 'xrules-shared-secret-key-change-in-production-min32',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'xrules-refresh-secret-key-change-in-production',
  // Access tokens last 1 hour by default — refresh tokens last 30 days.
  // These are accepted by jsonwebtoken's expiresIn (e.g. '15m', '1h', '7d').
  jwtTtl: process.env.JWT_TTL || '1h',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  engineHubUrl: process.env.ENGINE_HUB_URL || 'http://localhost:50051',
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;
