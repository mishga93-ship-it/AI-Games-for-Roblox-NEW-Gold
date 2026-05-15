// NOTE: production chat traffic routes to apps/functions/src/index.ts (chat
// handler at /api/chat/threads/:threadId/messages, deployed as Cloud Run
// `api`). This Express stub exists only for local-dev parity and is NOT
// mounted in production — iOS hits Cloud Run directly via APIClient. The 501
// below is intentional: any request reaching it indicates misconfigured dev
// routing, not a missing feature. Do not implement chat logic here; modify
// the Firebase function instead so iOS, Cloud Run, and dev all stay in sync.
import { Router } from 'express';

export const chatRouter = Router();

chatRouter.get('/threads', (_req, res) => {
  res.json({ threads: [] });
});

chatRouter.post('/threads/:threadId/messages', (_req, res) => {
  res.status(501).json({
    error: 'AI chat backend is not implemented yet.',
  });
});
