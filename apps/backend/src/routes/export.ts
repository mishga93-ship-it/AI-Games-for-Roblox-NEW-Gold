import { Router } from 'express';

export const exportRouter = Router();

exportRouter.get('/artifact/:id', (_req, res) => {
  res.status(501).json({
    error: 'Export artifact backend is not implemented yet.',
  });
});
