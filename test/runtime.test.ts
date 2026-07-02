import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Runtime, parseJsonIssueArray, parseQuestion } from '../src/runtime.js';
import { MockGitHub } from '../src/github.js';
import { MockProvider, ModelRouter } from '../src/models.js';
import { PromptLibrary, parsePrompt } from '../src/prompts.js';
import type { LoadedSpec } from '../src/agentspec.js';
import type { Mission, Workflow } from '../src/types.js';

const promptFixture = (id: string, inputs: string[]) =>
  parsePrompt(
    `---\nid: ${id}\ndescription: fixture\ninputs:\n${inputs.map((i) => `  - ${i}`).join('\n')}\n---\n\n` +
      `OPTIONS: JSON array marker for mock keying\n${inputs.map((i) => `{{${i}}}`).join('\n')}\n`,
    `${id}.md`,
  );

function makeFixtures() {
  const workflow: Workflow = {
    id: 'feature-prd',
    title: 'Feature PRD',
    capabilities: ['read', 'edit', 'git'],
    steps: [
      { id: 'grill', task: 'grill', agent: 'prd-interviewer', outputs: ['answers'], hitl: 'question' },
      { id: 'prd', task: 'write_prd', agent: 'prd-writer', outputs: ['prd_file'], hitl: 'approval' },
      { id: 'decompose', task: 'decompose', agent: 'issue-decomposer', outputs: ['child_issues'] },
    ],
  };
  const mission: Mission = {
    id: 'test-mission',
    title: 'Test Mission',
    permissions: ['read', 'edit', 'git'],
    workflows: [{ id: 'mw1', workflow: 'feature-prd', triggers: [{ type: 'manual' }] }],
  };
  const spec: LoadedSpec = { missions: [mission], workflows: new Map([['feature-prd', workflow]]) };
  const prompts = new PromptLibrary([
    promptFixture('prd-interviewer', ['issue_description', 'prior_answers']),
    promptFixture('prd-writer', ['issue_description', 'answers']),
    promptFixture('issue-decomposer', ['prd']),
  ]);
  const mockModel = new MockProvider();
  const router = new ModelRouter(
    { models: [{ name: 'mock:default', provider: 'mock', unlimited: true, skills: ['planner'] }], routing: { planner: ['mock:default'] } },
    { mock: mockModel },
  );
  const github = new MockGitHub();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-test-'));
  const rt = new Runtime({
    spec,
    prompts,
    router,
    github,
    repoPath: tmp,
    stateDir: path.join(tmp, 'state'),
  });
  return { rt, github, mockModel, tmp };
}

describe('runtime walking skeleton', () => {
  let f: ReturnType<typeof makeFixtures>;

  beforeEach(() => {
    f = makeFixtures();
  });

  it('runs grill → PRD approval → decompose end to end', async () => {
    const issue = f.github.seedIssue('Add run filtering', 'Filter runs by state.', ['type:feature']);
    f.mockModel.queue.push(
      'QUESTION: Which states matter most?\nOPTIONS:\nA. Active only\nB. All states',
      'NO_QUESTIONS',
      '# PRD: Run filtering\n\n## Summary\nFilter runs.',
      JSON.stringify([
        { title: 'Filter dropdown renders', body: 'Slice 1.' },
        { title: 'Filter is applied to the runs table', body: 'Slice 2.' },
      ]),
    );

    // grill asks a question and waits
    const run = f.rt.startRun('test-mission', 'mw1', issue);
    await f.rt.advance(run.runId);
    expect(run.state).toBe('waiting_for_human');
    const q = [...f.rt.questions.values()][0];
    expect(q.id).toBe(`q-${issue}-001`);
    expect(q.options).toEqual(['Active only', 'All states']);
    const comments = await f.github.listComments(issue);
    expect(comments.some((c) => c.body.includes('agentspec:question'))).toBe(true);
    expect((await f.github.getIssue(issue)).labels).toContain('state:needs-human');

    // answer → grill completes (NO_QUESTIONS) → PRD written → approval pending
    await f.rt.answerQuestion(q.id, 'A. Active only');
    await f.rt.advance(run.runId);
    expect(run.state).toBe('waiting_for_human');
    const prdFile = run.outputs['prd_file'] ?? [...f.rt.approvals.values()][0]?.outputs?.['prd_file'];
    expect(String(prdFile)).toMatch(/docs\/prds\/001-add-run-filtering\.md/);
    expect(fs.existsSync(path.join(f.tmp, String(prdFile)))).toBe(true);
    const approval = [...f.rt.approvals.values()].find((a) => a.state === 'pending');
    expect(approval).toBeDefined();

    // approve → decompose creates child issues → run completes
    await f.rt.resolveApproval(approval!.id, true);
    await f.rt.advance(run.runId);
    expect(run.state).toBe('completed');
    const children = run.outputs['child_issues'] as number[];
    expect(children).toHaveLength(2);
    const child = await f.github.getIssue(children[0]);
    expect(child.labels).toContain('state:ready-for-work');
    expect(child.labels).toContain('mission:test-mission');
    const finalComments = await f.github.listComments(issue);
    expect(finalComments.some((c) => c.body.includes('agentspec:answer'))).toBe(true);
    expect(finalComments.some((c) => c.body.includes('state: completed'))).toBe(true);
  });

  it('rejecting an approval blocks the run', async () => {
    const issue = f.github.seedIssue('Small feature', 'Body.', []);
    f.mockModel.queue.push('NO_QUESTIONS', '# PRD\n\nContent.');
    const run = f.rt.startRun('test-mission', 'mw1', issue);
    await f.rt.advance(run.runId);
    const approval = [...f.rt.approvals.values()].find((a) => a.state === 'pending');
    await f.rt.resolveApproval(approval!.id, false, 'not enough detail');
    expect(run.state).toBe('blocked');
    await f.rt.advance(run.runId); // must not resurrect a blocked run
    expect(run.state).toBe('blocked');
  });

  it('prevents duplicate active runs for the same issue and workflow', async () => {
    const issue = f.github.seedIssue('Dup', 'Body.', []);
    f.rt.startRun('test-mission', 'mw1', issue);
    expect(() => f.rt.startRun('test-mission', 'mw1', issue)).toThrow(/already active/);
  });

  it('rejects malformed answers', async () => {
    const issue = f.github.seedIssue('Answers', 'Body.', []);
    f.mockModel.queue.push('QUESTION: Pick one?\nOPTIONS:\nA. Yes\nB. No');
    const run = f.rt.startRun('test-mission', 'mw1', issue);
    await f.rt.advance(run.runId);
    const q = [...f.rt.questions.values()].find((x) => x.state === 'open')!;
    await expect(f.rt.answerQuestion(q.id, '!!nonsense')).rejects.toThrow(/option letter/);
    await expect(f.rt.answerQuestion(q.id, 'custom: do both')).resolves.toBeDefined();
  });
});

describe('parsers', () => {
  it('parses QUESTION/OPTIONS blocks', () => {
    const p = parseQuestion('QUESTION: What?\nOPTIONS:\nA. One\nB. Two');
    expect(p.text).toBe('What?');
    expect(p.options).toEqual(['One', 'Two']);
  });

  it('falls back to whole text when unstructured', () => {
    const p = parseQuestion('Just asking something?');
    expect(p.text).toBe('Just asking something?');
    expect(p.options).toEqual([]);
  });

  it('parses JSON arrays with code fences and prose', () => {
    const items = parseJsonIssueArray('Here you go:\n```json\n[{"title":"t","body":"b"}]\n```');
    expect(items).toEqual([{ title: 't', body: 'b' }]);
  });

  it('rejects output without a JSON array', () => {
    expect(() => parseJsonIssueArray('no array here')).toThrow(/JSON array/);
  });
});
