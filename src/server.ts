import express from 'express';
import type { Runtime } from './runtime.js';
import { cockpitPage } from './cockpit.js';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createServer(rt: Runtime): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.type('html').send(cockpitPage());
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      missions: rt.listMissions(),
      runs: [...rt.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      questions: [...rt.questions.values()].filter((q) => q.state === 'open'),
      approvals: [...rt.approvals.values()].filter((a) => a.state === 'pending'),
    });
  });

  app.post('/api/runs', (req, res) => {
    try {
      const { mission, workflow, issue } = req.body as { mission: string; workflow: string; issue: number };
      const run = rt.startRun(mission, workflow, Number(issue));
      void rt.advance(run.runId).catch(() => {}); // failures land on the run record
      res.json(run);
    } catch (e) {
      res.status(400).json({ error: msg(e) });
    }
  });

  app.post('/api/questions/:id/answer', async (req, res) => {
    try {
      const run = await rt.answerQuestion(req.params.id, String((req.body as { answer?: string }).answer ?? ''));
      void rt.advance(run.runId).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: msg(e) });
    }
  });

  app.post('/api/approvals/:id/resolve', async (req, res) => {
    try {
      const { approved, feedback } = req.body as { approved: boolean; feedback?: string };
      const run = await rt.resolveApproval(req.params.id, !!approved, feedback);
      if (approved) void rt.advance(run.runId).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: msg(e) });
    }
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    try {
      res.json(rt.cancelRun(req.params.id));
    } catch (e) {
      res.status(400).json({ error: msg(e) });
    }
  });

  return app;
}
