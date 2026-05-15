import { Router } from 'express';

export const moderationRouter = Router();

moderationRouter.post('/check', (req, res) => {
  const { text } = req.body ?? {};
  res.json({ allowed: true });
});
