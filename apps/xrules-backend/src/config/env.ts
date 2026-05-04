import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://xrules:xrules_secret@localhost:5433/xrulesdb',
  jwtSecret: process.env.JWT_SECRET || 'xrules-shared-secret-key-change-in-production-min32',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'xrules-refresh-secret-key-change-in-production',
  engineHubUrl: process.env.ENGINE_HUB_URL || 'http://localhost:50051',
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;
