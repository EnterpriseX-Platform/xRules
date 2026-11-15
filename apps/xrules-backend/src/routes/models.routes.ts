import { Router, Request, Response, NextFunction } from 'express';
import * as modelsService from '../services/models.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } });
      return;
    }
    const result = await modelsService.listModels(projectId, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await modelsService.getModel(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await modelsService.createModel(req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await modelsService.updateModel(req.params.id, req.body, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await modelsService.deleteModel(req.params.id, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---- ML: catalogue · versions · train · publish · gate · try · report
const ml = () => import('../platform/ml.js');
const h = (fn: (req: Request) => Promise<any>, code = 200) => (req: Request, res: Response, next: NextFunction) => fn(req).then(d => res.status(code).json({ success: true, data: d })).catch(next);
router.get('/ml/catalogue', authMiddleware, h(async () => (await ml()).catalogue()));
router.get('/versions/:vid', authMiddleware, h(async req => (await ml()).getVersion(req.params.vid, req.user!)));
router.get('/versions/:vid/report.html', authMiddleware, async (req, res, next) => { try { res.type('html').send(await (await ml()).reportHtml(req.params.vid, req.user!)); } catch (e) { next(e); } });
router.post('/versions/:vid/publish', authMiddleware, h(async req => (await ml()).publish(req.params.vid, req.user!)));
router.post('/versions/:vid/predict', authMiddleware, h(async req => (await ml()).tryPredict(req.params.vid, req.body?.rows || [], req.user!)));
router.get('/:id/versions', authMiddleware, h(async req => (await ml()).listVersions(req.params.id, req.user!)));
router.post('/:id/train', authMiddleware, h(async req => (await ml()).train(req.params.id, req.body || {}, req.user!), 201));
router.put('/:id/gate', authMiddleware, h(async req => (await ml()).setGate(req.params.id, req.body || {}, req.user!)));

export default router;
