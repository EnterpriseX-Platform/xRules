import { Router } from 'express';
import authRoutes from './auth.routes.js';
import projectsRoutes from './projects.routes.js';
import rulesRoutes from './rules.routes.js';
import flowsRoutes from './flows.routes.js';
import executeRoutes from './execute.routes.js';
import executionsRoutes from './executions.routes.js';
import workspacesRoutes from './workspaces.routes.js';
import modelsRoutes from './models.routes.js';
import analyticsRoutes from './analytics.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import apikeysRoutes from './apikeys.routes.js';
import dataRoutes from './data.routes.js';
import publicExecuteRoutes from './publicExecute.routes.js';
import testcasesRoutes from './testcases.routes.js';
import testsuitesRoutes from './testsuites.routes.js';
import datasetsRoutes from './datasets.routes.js';
import scenariosRoutes from './scenarios.routes.js';
import connectionsRoutes from './connections.routes.js';
import releasesRoutes from './releases.routes.js';
import environmentsRoutes from './environments.routes.js';
import simulationsRoutes from './simulations.routes.js';
import openapiRoutes from './openapi.routes.js';
import usersRoutes from './users.routes.js';
import foldersRoutes from './folders.routes.js';
import jobsRoutes from './jobs.routes.js';
import toolsRoutes from './tools.routes.js';
import compareRoutes from './compare.routes.js';
import biRoutes from './bi.routes.js';
import webhooksRoutes from './webhooks.routes.js';
import assistantRoutes from './assistant.routes.js';

const router = Router();

// Auth
router.use('/auth', authRoutes);
router.use('/auth', usersRoutes);

// Public API (Solver / API key)
router.use('/api/v1', publicExecuteRoutes);
router.use('/api/v1', openapiRoutes);

// Internal admin/UI
router.use('/dashboard', dashboardRoutes);
router.use('/api-keys', apikeysRoutes);
router.use('/projects', projectsRoutes);
router.use('/rules', rulesRoutes);
router.use('/rules', testcasesRoutes);
router.use('/flows', flowsRoutes);
router.use('/execute', executeRoutes);
router.use('/executions', executionsRoutes);
router.use('/workspaces', workspacesRoutes);
router.use('/workspaces', usersRoutes);
router.use('/models', modelsRoutes);
router.use('/analytics', analyticsRoutes);

// v2 entities
router.use('/folders', foldersRoutes);
router.use('/test-suites', testsuitesRoutes);
router.use('/datasets', datasetsRoutes);
router.use('/scenarios', scenariosRoutes);
router.use('/connections', connectionsRoutes);
router.use('/data', dataRoutes);
router.use('/releases', releasesRoutes);
router.use('/environments', environmentsRoutes);
router.use('/simulations', simulationsRoutes);

// Phase 4-5 features
router.use('/jobs', jobsRoutes);
router.use('/tools', toolsRoutes);
router.use('/', compareRoutes); // /rules/:id/compare
router.use('/bi', biRoutes);    // /bi/audit/v2
router.use('/webhooks', webhooksRoutes);
router.use('/assistant', assistantRoutes);

export default router;
