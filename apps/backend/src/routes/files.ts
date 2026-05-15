import { Router } from 'express';

export const filesRouter = Router();

filesRouter.get('/:filename', (_req, res) => {
  res.status(404).json({ error: 'File not found' });
});
