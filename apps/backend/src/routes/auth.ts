import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/signin', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  res.json({
    token: 'mock-jwt-' + Date.now(),
    user: { id: 'u1', displayName: 'User', email },
  });
});

authRouter.post('/signup', (req, res) => {
  const { email, password, displayName } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  res.json({
    token: 'mock-jwt-' + Date.now(),
    user: { id: 'u' + Date.now(), displayName: displayName || 'User', email },
  });
});
