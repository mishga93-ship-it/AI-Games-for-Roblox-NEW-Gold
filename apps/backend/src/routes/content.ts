import { Router } from 'express';

export const contentRouter = Router();

contentRouter.post('/generate', (_req, res) => {
  res.status(501).json({
    error: 'Content generation backend is not implemented yet.',
  });
});
