import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { contentRouter } from './routes/content.js';
import { exportRouter } from './routes/export.js';
import { moderationRouter } from './routes/moderation.js';
import { socialRouter } from './routes/social.js';
import { filesRouter } from './routes/files.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Static files for uploads
app.use('/files', express.static(process.env.UPLOAD_DIR ?? 'uploads'));

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/content', contentRouter);
app.use('/api/export', exportRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/social', socialRouter);
app.use('/api/files', filesRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-roblox-gold-api' });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
