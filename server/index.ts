import express from 'express';
import { killSwitchGate } from './middleware/killSwitch.js';
import { requireAuth } from './middleware/auth.js';
import { requireOidc } from './middleware/oidc.js';
import healthRouter from './routes/health.js';
import settingsRouter from './routes/settings.js';
import generateRouter from './routes/generate.js';
import renderJobsRouter from './routes/renderJobs.js';
import renderWorkerRouter from './routes/renderWorker.js';
import postsActionsRouter from './routes/postsActions.js';
import publishWorkerRouter from './routes/publishWorker.js';
import './lib/firebase.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

// Public health for liveness probes (no auth, no killswitch).
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// /api/* - Firebase ID-token + allowlist + onboarding gate
app.use('/api', killSwitchGate, requireAuth);
app.use('/api', healthRouter);
app.use('/api/settings', settingsRouter);
app.use('/api', generateRouter);
app.use('/api', renderJobsRouter);
app.use('/api', postsActionsRouter);

// /internal/* - OIDC audience + invoker SA
app.use('/internal', killSwitchGate, requireOidc);
app.use('/internal', healthRouter);
app.use('/internal', renderWorkerRouter);
app.use('/internal', publishWorkerRouter);

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`content-gen listening on :${PORT}`);
});
