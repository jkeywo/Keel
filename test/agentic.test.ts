import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Runtime } from '../src/runtime.js';
import { MockGitHub } from '../src/github.js';
import { MockProvider, ModelRouter } from '../src/models.js';
import { PromptLibrary } from '../src/prompts.js';
import { WorktreeManager } from '../src/worktrees.js';
import type { AgentExecutor } from '../src/agents.js';
import { runCli } from '../src/cli.js';
import type { LoadedSpec } from '../src/agentspec.js';
import type { Mission, Workflow } from '../src/types.js';

const git = async (args: string[], cwd: string) => {
  const r = await runCli('git', args, { cwd, timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
};

async function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-agentic-'));
  const repo = path.join(root, 'repo');
  const bare = path.join(root, 'origin.git');
  fs.mkdirSync(repo);
  fs.mkdirSync(bare);
  await git(['init', '--bare'], bare);
  await git(['init', '-b', 'main'], repo);
  await git(['config', 'user.name', 'Test User'], repo);
  await git(['config', 'user.email', 'test@example.com'], repo);
  fs.writeFileSync(path.join(repo, 'projectspec.yaml'), 'language: typescript\ntest:\n  - node -e "process.exit(0)"\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  await git(['add', '-A'], repo);
  await git(['commit', '-m', 'init'], repo);
  await git(['remote', 'add', 'origin', bare], repo);
  return { root, repo };
}

/** Stands in for the Docker/host coding agent: writes a file and commits. */
function fakeAgent(behaviour: 'commits' | 'leaves-dirty' | 'does-nothing' = 'commits'): AgentExecutor {
  return {
    async implement(_runId: string, worktree: string): Promise<string> {
      if (behaviour === 'does-nothing') return 'I did nothing.';
      fs.writeFileSync(path.join(worktree, 'feature.txt'), 'implemented\n');
      if (behaviour === 'commits') {
        await git(['add', '-A'], worktree);
        await git(['commit', '-m', 'Implement feature\n\nAgentSpec-Run: test\nIssue: #1'], worktree);
      }
      return 'Implemented the feature and verified tests.';
    },
  } as unknown as AgentExecutor;
}

function fixtures(repo: string, root: string, agent: AgentExecutor) {
  const workflow: Workflow = {
    id: 'issue-implementation',
    title: 'Issue Implementation',
    capabilities: ['read', 'edit', 'git', 'build'],
    steps: [
      { id: 'implement', task: 'agent_implement', agent: 'coding-agent', outputs: ['branch', 'worktree'] },
      { id: 'ci', task: 'run_ci', agent: 'ci-runner', outputs: ['ci_status'] },
      { id: 'pr', task: 'open_pr', agent: 'pr-opener', outputs: ['pull_request'], hitl: 'approval' },
    ],
  };
  const mission: Mission = {
    id: 'test-mission',
    title: 'Test Mission',
    permissions: ['read', 'edit', 'git', 'build'],
    workflows: [{ id: 'impl', workflow: 'issue-implementation' }],
  };
  const spec: LoadedSpec = { missions: [mission], workflows: new Map([['issue-implementation', workflow]]) };
  const github = new MockGitHub();
  const router = new ModelRouter(
    { models: [{ name: 'mock:default', provider: 'mock', unlimited: true, skills: [] }], routing: {} },
    { mock: new MockProvider() },
  );
  const rt = new Runtime({
    spec,
    prompts: new PromptLibrary(),
    router,
    github,
    repoPath: repo,
    stateDir: path.join(root, 'state'),
    worktrees: new WorktreeManager({ repoPath: repo, baseDir: path.join(root, 'worktrees') }),
    agents: agent,
  });
  return { rt, github };
}

describe('agentic issue-implementation workflow', () => {
  let repo: string;
  let root: string;

  beforeEach(async () => {
    const r = await makeRepo();
    repo = r.repo;
    root = r.root;
  });

  it('implements, verifies, and opens a PR pending approval', async () => {
    const { rt, github } = fixtures(repo, root, fakeAgent('commits'));
    const issue = github.seedIssue('Add version endpoint', 'GET /api/version returns the package version.', [
      'state:ready-for-work',
    ]);
    const run = rt.startRun('test-mission', 'impl', issue);
    await rt.advance(run.runId);

    expect(run.state).toBe('waiting_for_human'); // PR opened, approval pending
    expect(run.branch).toMatch(/^agent\/1-add-version-endpoint/);
    expect(fs.existsSync(path.join(root, 'worktrees', run.runId, 'feature.txt'))).toBe(true);
    expect(run.outputs['ci_status']).toBe('passed');
    expect(github.pullRequests).toHaveLength(1);
    const pr = github.pullRequests[0];
    expect(pr.head).toBe(run.branch);
    expect(pr.body).toContain('agentspec:pr');
    expect(pr.body).toContain(`Closes #${issue}`);
    expect((await github.getIssue(issue)).labels).toContain('state:pr-open');

    // the branch actually reached origin
    const remote = await git(['ls-remote', '--heads', 'origin'], repo);
    expect(remote).toContain(run.branch!);

    const approval = [...rt.approvals.values()].find((a) => a.state === 'pending')!;
    await rt.resolveApproval(approval.id, true);
    await rt.advance(run.runId);
    expect(run.state).toBe('completed');
  });

  it('salvages uncommitted agent changes with a runtime commit', async () => {
    const { rt } = fixtures(repo, root, fakeAgent('leaves-dirty'));
    const { github } = { github: undefined as never };
    void github;
    const gh = (rt as unknown as { o: { github: MockGitHub } }).o.github;
    const issue = gh.seedIssue('Dirty agent', 'Body.', []);
    const run = rt.startRun('test-mission', 'impl', issue);
    await rt.advance(run.runId);
    expect(run.state).toBe('waiting_for_human');
    const log = await git(['log', '--format=%s', run.branch!.length ? `${run.branch}` : 'HEAD'], repo);
    expect(log).toContain('Agent changes for');
  });

  it('fails when the agent produces no commits', async () => {
    const { rt, github } = fixtures(repo, root, fakeAgent('does-nothing'));
    const issue = github.seedIssue('Lazy agent', 'Body.', []);
    const run = rt.startRun('test-mission', 'impl', issue);
    await rt.advance(run.runId);
    expect(run.state).toBe('failed');
    expect(run.error).toMatch(/no commits/);
  });

  it('blocks (not fails) when CI fails', async () => {
    fs.writeFileSync(path.join(repo, 'projectspec.yaml'), 'language: typescript\ntest:\n  - node -e "process.exit(1)"\n');
    await git(['add', '-A'], repo);
    await git(['commit', '-m', 'failing tests'], repo);
    const { rt, github } = fixtures(repo, root, fakeAgent('commits'));
    const issue = github.seedIssue('Broken CI', 'Body.', []);
    const run = rt.startRun('test-mission', 'impl', issue);
    await rt.advance(run.runId);
    expect(run.state).toBe('blocked');
    expect(run.error).toMatch(/CI failed/);
    expect(github.pullRequests).toHaveLength(0); // never reached open_pr
  });
});
