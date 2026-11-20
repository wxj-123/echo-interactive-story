import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.ts';

const app = express();
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT ?? 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// 简单的请求日志，方便排查「点了没反应」
app.use('/api', (req, _res, next) => {
  console.log(`[api] ${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api', api);

/**
 * 生产态：同一个端口托管 dist 与 API。
 * 开发态 dist 不存在，只跑 API，前端由 Vite 提供（5173）。
 */
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('text/plain')
      .send('《回声》API 已启动。\n开发模式请访问 http://localhost:5173\n生产模式请先执行 npm run build');
  });
}

// 兜底错误处理：任何未捕获异常都返回结构化 JSON，不吐 HTML 堆栈
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
});

app.listen(port, () => {
  const mode = existsSync(dist) ? '生产（托管 dist）' : '开发（仅 API）';
  console.log(`\n  回声 ECHO · API 已就绪  http://localhost:${port}  [${mode}]`);
  console.log(`  模型：${process.env.LLM_API_KEY ? process.env.LLM_MODEL || 'gpt-4o-mini' : '未配置 Key，将走本地降级'}\n`);
});
