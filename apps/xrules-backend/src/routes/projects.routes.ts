import { Router, type Request, type Response, type NextFunction } from 'express';
import * as projectsService from '../services/projects.service.js';
import { authMiddleware } from '../middleware/auth.js';

// Tenant + project role are already checked by tenantGuard (req.tenant / req.projectRole).
const router = Router();
const h = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
router.use(authMiddleware);

router.get('/', h(async (req, res) => { res.json({ success: true, data: await projectsService.listProjects(req.user!.userId, req.tenant!) }); }));
router.get('/:id', h(async (req, res) => { res.json({ success: true, data: await projectsService.getProject(req.params.id, req.user!.userId, req.tenant!) }); }));
router.post('/', h(async (req, res) => { res.status(201).json({ success: true, data: await projectsService.createProject(req.body ?? {}, req.user!.userId, req.tenant!) }); }));
router.put('/:id', h(async (req, res) => { res.json({ success: true, data: await projectsService.updateProject(req.params.id, req.body ?? {}, req.user!.userId, req.tenant!) }); }));
router.delete('/:id', h(async (req, res) => { await projectsService.deleteProject(req.params.id, req.tenant!); res.json({ success: true }); }));

router.get('/:id/members', h(async (req, res) => { res.json({ success: true, data: await projectsService.listProjectMembers(req.params.id, req.tenant!) }); }));
router.put('/:id/members/:userId', h(async (req, res) => {
  res.json({ success: true, data: await projectsService.setProjectMember(req.params.id, req.params.userId, req.body?.role ?? null, req.tenant!) });
}));
router.delete('/:id/members/:userId', h(async (req, res) => {
  res.json({ success: true, data: await projectsService.setProjectMember(req.params.id, req.params.userId, null, req.tenant!) });
}));

export default router;
