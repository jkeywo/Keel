import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import type { Runtime } from '../src/runtime.js';

const mockRt = {
  listMissions: () => [],
  runs: new Map(),
  questions: new Map(),
  approvals: new Map(),
  startRun: () => { throw new Error('not needed'); },
  answerQuestion: async () => { throw new Error('not needed'); },
  resolveApproval: async () => { throw new Error('not needed'); },
  advance: async () => {},
  cancelRun: () => { throw new Error('not needed'); },
} as unknown as Runtime;

describe('GET /api/version', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const app = createServer(mockRt);
        server = http.createServer(app);
        server.listen(0, () => {
          const { port } = server.address() as { port: number };
          baseUrl = `http://localhost:${port}`;
          resolve();
        });
      }),
  );

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns 200 with a semver version string', async () => {
    const res = await fetch(`${baseUrl}/api/version`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string };
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('returns the version from package.json', async () => {
    const res = await fetch(`${baseUrl}/api/version`);
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe('0.1.0');
  });
});
