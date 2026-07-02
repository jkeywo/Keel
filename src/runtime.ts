import fs from 'node:fs';
import path from 'node:path';
import type { Approval, Question, RunRecord, Workflow, WorkflowStep } from './types.js';
import type { LoadedSpec } from './agentspec.js';
import { resolveWorkflow } from './agentspec.js';
import { PromptLibrary, fillPrompt } from './prompts.js';
import { ModelRouter, estimateTokens } from './models.js';
import type { GitHubAdapter } from './github.js';
import type { WorktreeManager } from './worktrees.js';
import type { AgentExecutor } from './agents.js';
import { loadProjectSpec } from './projectspec.js';
import { runShell } from './cli.js';

export interface RuntimeOptions {
  spec: LoadedSpec;
  prompts: PromptLibrary;
  router: ModelRouter;
  github: GitHubAdapter;
  repoPath: string;
  stateDir: string;
  /** Required for the agent_implement / run_ci / open_pr tasks. */
  worktrees?: WorktreeManager;
  agents?: AgentExecutor;
  logger?: (msg: string) => void;
}

/** Thrown when a step cannot proceed but human intervention may fix it
 * (e.g. failing tests). The run goes to `blocked`, not `failed`. */
export class RunBlockedError extends Error {}

interface StepResult {
  waiting?: boolean;
  outputs?: Record<string, unknown>;
}

/** Task templates: default prompt id and model skill per task type. */
const TASKS: Record<string, { prompt: string; skill: string }> = {
  grill: { prompt: 'prd-interviewer', skill: 'planner' },
  write_prd: { prompt: 'prd-writer', skill: 'planner' },
  decompose: { prompt: 'issue-decomposer', skill: 'planner' },
};

const MAX_GRILL_ROUNDS = 3;

const now = () => new Date().toISOString();

export class Runtime {
  readonly runs = new Map<string, RunRecord>();
  readonly questions = new Map<string, Question>();
  readonly approvals = new Map<string, Approval>();

  constructor(private o: RuntimeOptions) {
    this.loadState();
  }

  // ---- lifecycle -----------------------------------------------------

  listMissions() {
    return this.o.spec.missions;
  }

  startRun(missionId: string, missionWorkflowId: string, issue: number): RunRecord {
    const mission = this.o.spec.missions.find((m) => m.id === missionId);
    if (!mission) throw new Error(`unknown mission "${missionId}"`);
    const wf = resolveWorkflow(this.o.spec, mission, missionWorkflowId);
    const dup = [...this.runs.values()].find(
      (r) => r.workflow === wf.id && r.issue === issue && !['completed', 'failed', 'cancelled'].includes(r.state),
    );
    if (dup) throw new Error(`run ${dup.runId} is already active for issue #${issue} and workflow ${wf.id}`);

    const today = now().slice(0, 10);
    const seq = [...this.runs.keys()].filter((id) => id.startsWith(`run-${today}`)).length + 1;
    const run: RunRecord = {
      runId: `run-${today}-${String(seq).padStart(3, '0')}`,
      mission: missionId,
      missionWorkflow: missionWorkflowId,
      workflow: wf.id,
      issue,
      state: 'pending',
      stepIndex: 0,
      answers: {},
      outputs: {},
      log: [],
      createdAt: now(),
      updatedAt: now(),
    };
    this.runs.set(run.runId, run);
    this.log(run, `created for issue #${issue} (workflow ${wf.id})`);
    this.saveState();
    return run;
  }

  /** Executes steps until the run waits, blocks, fails, or completes. Idempotent. */
  async advance(runId: string): Promise<RunRecord> {
    const run = this.mustRun(runId);
    if (!['pending', 'running', 'waiting_for_human'].includes(run.state)) return run;
    const wf = this.workflowFor(run);

    for (;;) {
      const step = wf.steps[run.stepIndex];
      if (!step) {
        await this.completeRun(run, wf);
        break;
      }
      run.state = 'running';
      run.currentStep = step.id;
      this.touch(run);

      let result: StepResult;
      try {
        result = await this.executeStep(run, step);
      } catch (err) {
        const blocked = err instanceof RunBlockedError;
        run.state = blocked ? 'blocked' : 'failed';
        run.error = err instanceof Error ? err.message : String(err);
        this.log(run, `step ${step.id} ${blocked ? 'blocked' : 'failed'}: ${run.error}`);
        this.touch(run);
        this.saveState();
        break;
      }

      if (result.waiting) {
        run.state = 'waiting_for_human';
        this.touch(run);
        this.saveState();
        break;
      }
      if (result.outputs) Object.assign(run.outputs, result.outputs);
      this.log(run, `step ${step.id} completed`);
      run.stepIndex += 1;
      this.touch(run);
      this.saveState();
    }
    return run;
  }

  cancelRun(runId: string): RunRecord {
    const run = this.mustRun(runId);
    if (['completed', 'failed', 'cancelled'].includes(run.state)) {
      throw new Error(`run ${runId} is already ${run.state}`);
    }
    run.state = 'cancelled';
    this.log(run, 'cancelled by user');
    this.touch(run);
    this.saveState();
    return run;
  }

  // ---- HITL ----------------------------------------------------------

  /**
   * Answer format per Spec/01: first non-empty line begins with an option
   * letter or `custom:`. Caller is trusted (local cockpit = repo owner).
   */
  async answerQuestion(qid: string, answer: string): Promise<RunRecord> {
    const q = this.questions.get(qid);
    if (!q) throw new Error(`unknown question "${qid}"`);
    if (q.state === 'answered') throw new Error(`question ${qid} is already answered`);
    const first = answer.trim().split(/\r?\n/)[0]?.trim() ?? '';
    if (!/^([A-Za-z][.)]?(\s|$)|custom:)/i.test(first)) {
      throw new Error('answer must begin with an option letter or "custom:"');
    }
    q.state = 'answered';
    q.answer = answer.trim();
    const run = this.mustRun(q.runId);
    run.answers[qid] = q.answer;
    await this.o.github.addComment(q.issue, `<!-- agentspec:answer\nquestion: ${qid}\n-->\n\n${q.answer}`);
    const stillOpen = [...this.questions.values()].some((x) => x.runId === run.runId && x.state === 'open');
    if (!stillOpen) await this.tryLabels(run, [], ['state:needs-human']);
    this.log(run, `answer recorded for ${qid}`);
    this.saveState();
    return run;
  }

  async resolveApproval(id: string, approved: boolean, feedback?: string): Promise<RunRecord> {
    const ap = this.approvals.get(id);
    if (!ap) throw new Error(`unknown approval "${id}"`);
    if (ap.state !== 'pending') throw new Error(`approval ${id} is already ${ap.state}`);
    const run = this.mustRun(ap.runId);
    if (approved) {
      ap.state = 'approved';
      this.log(run, `step ${ap.stepId} approved`);
    } else {
      ap.state = 'rejected';
      ap.feedback = feedback;
      run.state = 'blocked';
      this.log(run, `step ${ap.stepId} rejected: ${feedback ?? '(no feedback)'}`);
      this.touch(run);
    }
    this.saveState();
    return run;
  }

  // ---- step execution ------------------------------------------------

  private async executeStep(run: RunRecord, step: WorkflowStep): Promise<StepResult> {
    if (step.hitl === 'approval') {
      const key = `${run.runId}:${step.id}`;
      const existing = this.approvals.get(key);
      if (existing?.state === 'approved') return { outputs: existing.outputs ?? {} };
      if (existing?.state === 'pending') return { waiting: true };
      if (existing?.state === 'rejected') return { waiting: true }; // run is blocked; nothing to do
    }

    const result = await this.runTask(run, step);
    if (result.waiting) return result;

    if (step.hitl === 'approval') {
      const key = `${run.runId}:${step.id}`;
      this.approvals.set(key, {
        id: key,
        runId: run.runId,
        stepId: step.id,
        summary: Object.entries(result.outputs ?? {})
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(', '),
        state: 'pending',
        outputs: result.outputs,
        createdAt: now(),
      });
      this.log(run, `step ${step.id} awaiting approval`);
      return { waiting: true };
    }
    return result;
  }

  private async runTask(run: RunRecord, step: WorkflowStep): Promise<StepResult> {
    switch (step.task) {
      case 'grill':
        return this.taskGrill(run, step);
      case 'write_prd':
        return this.taskWritePrd(run, step);
      case 'decompose':
        return this.taskDecompose(run, step);
      case 'agent_implement':
        return this.taskAgentImplement(run);
      case 'run_ci':
        return this.taskRunCi(run);
      case 'open_pr':
        return this.taskOpenPr(run);
      default:
        throw new Error(`unknown task type "${step.task}"`);
    }
  }

  private async taskGrill(run: RunRecord, step: WorkflowStep): Promise<StepResult> {
    const stepQs = [...this.questions.values()].filter((q) => q.runId === run.runId && q.stepId === step.id);
    if (stepQs.some((q) => q.state === 'open')) return { waiting: true };
    if (stepQs.length >= MAX_GRILL_ROUNDS) {
      this.log(run, `grill round limit (${MAX_GRILL_ROUNDS}) reached; proceeding`);
      return { outputs: { answers: run.answers } };
    }

    const issue = await this.o.github.getIssue(run.issue);
    const prior = stepQs.map((q) => `${q.text}\n→ ${q.answer}`).join('\n\n') || 'None';
    const text = await this.generate(run, step, {
      issue_description: `#${issue.number} ${issue.title}\n\n${issue.body}`,
      prior_answers: prior,
    });

    if (text.trim().includes('NO_QUESTIONS')) {
      this.log(run, 'interviewer has no further questions');
      return { outputs: { answers: run.answers } };
    }

    const parsed = parseQuestion(text);
    const seq = [...this.questions.values()].filter((q) => q.issue === run.issue).length + 1;
    const q: Question = {
      id: `q-${run.issue}-${String(seq).padStart(3, '0')}`,
      runId: run.runId,
      stepId: step.id,
      issue: run.issue,
      text: parsed.text,
      options: parsed.options,
      state: 'open',
      createdAt: now(),
    };
    this.questions.set(q.id, q);
    await this.o.github.addComment(run.issue, questionComment(q, run, step));
    await this.tryLabels(run, ['state:needs-human'], []);
    this.log(run, `asked ${q.id}`);
    return { waiting: true };
  }

  private async taskWritePrd(run: RunRecord, step: WorkflowStep): Promise<StepResult> {
    const issue = await this.o.github.getIssue(run.issue);
    const answers =
      Object.entries(run.answers)
        .map(([id, a]) => `Q: ${this.questions.get(id)?.text ?? id}\nA: ${a}`)
        .join('\n\n') || 'None';
    const md = await this.generate(run, step, {
      issue_description: `#${issue.number} ${issue.title}\n\n${issue.body}`,
      answers,
    });

    const slug =
      issue.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40) || 'feature';
    const relFile = path.join('docs', 'prds', `${String(issue.number).padStart(3, '0')}-${slug}.md`);
    const absFile = path.join(this.o.repoPath, relFile);
    fs.mkdirSync(path.dirname(absFile), { recursive: true });
    fs.writeFileSync(absFile, md.trim() + '\n', 'utf8');
    await this.tryLabels(run, ['state:prd-draft'], []);
    this.log(run, `wrote ${relFile}`);
    return { outputs: { prd_file: relFile.replace(/\\/g, '/') } };
  }

  private async taskDecompose(run: RunRecord, step: WorkflowStep): Promise<StepResult> {
    const prdFile = run.outputs['prd_file'] as string | undefined;
    if (!prdFile) throw new Error('decompose requires a prd_file output from a previous step');
    const prd = fs.readFileSync(path.join(this.o.repoPath, prdFile), 'utf8');

    let raw = await this.generate(run, step, { prd });
    let items: { title: string; body: string }[];
    try {
      items = parseJsonIssueArray(raw);
    } catch {
      this.log(run, 'decomposer output unparseable; retrying with stricter instruction');
      raw = await this.generate(run, step, { prd }, '\n\nIMPORTANT: Respond with ONLY the JSON array. No prose, no code fences.');
      items = parseJsonIssueArray(raw);
    }

    const created: number[] = [];
    for (const item of items) {
      const body = `${item.body}\n\n---\nParent: #${run.issue}\nPRD: ${prdFile}\nAgentSpec-Run: ${run.runId}`;
      const num = await this.o.github.createIssue(item.title, body, [
        'state:ready-for-work',
        `mission:${run.mission}`,
      ]);
      created.push(num);
      this.log(run, `created child issue #${num}: ${item.title}`);
    }

    const list = created.map((n) => `- #${n}`).join('\n');
    await this.o.github.addComment(
      run.issue,
      `<!-- agentspec:run\nid: ${run.runId}\nworkflow: ${run.workflow}\nstep: ${step.id}\nstate: completed\n-->\n\nDecomposed ${prdFile} into ${created.length} implementation issue(s):\n\n${list}`,
    );
    return { outputs: { child_issues: created } };
  }

  private async taskAgentImplement(run: RunRecord): Promise<StepResult> {
    if (!this.o.worktrees || !this.o.agents) {
      throw new Error('agentic executor is not configured (worktrees/agents missing from RuntimeOptions)');
    }
    const issue = await this.o.github.getIssue(run.issue);
    const slug =
      issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30) || 'issue';
    const wt = await this.o.worktrees.create(run.runId, run.issue, slug);
    run.worktree = wt.path;
    run.branch = wt.branch;
    this.log(run, `worktree ${wt.path} on branch ${wt.branch}`);
    await this.tryLabels(run, ['state:agent-working'], ['state:ready-for-work']);

    // PRD link, if the decomposer recorded one in the issue body.
    let prd = '';
    const prdMatch = issue.body.match(/PRD:\s*(docs\/prds\/\S+\.md)/);
    if (prdMatch) {
      const prdPath = path.join(this.o.repoPath, prdMatch[1]);
      if (fs.existsSync(prdPath)) prd = fs.readFileSync(prdPath, 'utf8');
    }
    const ps = loadProjectSpec(this.o.repoPath);
    const prompt = buildImplementPrompt(issue.number, issue.title, issue.body, prd, ps?.test ?? [], run.runId);

    const summary = await this.o.agents.implement(run.runId, wt.path, prompt);
    this.log(run, `agent finished: ${summary.slice(0, 160).replace(/\s+/g, ' ')}`);

    if (await this.o.worktrees.isDirty(wt.path)) {
      await this.o.worktrees.commitAll(
        wt.path,
        `Agent changes for #${run.issue}\n\nAgentSpec-Run: ${run.runId}\nIssue: #${run.issue}`,
      );
      this.log(run, 'committed uncommitted agent changes');
    }
    const commits = await this.o.worktrees.commitsSince(wt.path, wt.baseCommit);
    if (commits === 0) throw new Error('coding agent produced no commits');
    this.log(run, `${commits} commit(s) on ${wt.branch}`);
    return { outputs: { branch: wt.branch, worktree: wt.path, agent_summary: summary.slice(0, 500) } };
  }

  private async taskRunCi(run: RunRecord): Promise<StepResult> {
    const wt = run.worktree ?? (run.outputs['worktree'] as string | undefined);
    if (!wt) throw new Error('run_ci requires a worktree from agent_implement');
    const ps = loadProjectSpec(this.o.repoPath);
    const commands: string[] = [];
    if (fs.existsSync(path.join(wt, 'package.json'))) commands.push('npm install');
    commands.push(...(ps?.test ?? []));
    if (!commands.length) throw new Error('projectspec.yaml defines no test commands');

    for (const cmd of commands) {
      this.log(run, `ci: ${cmd}`);
      const r = await runShell(cmd, { cwd: wt, timeoutMs: 10 * 60_000 });
      if (r.code !== 0) {
        const tail = (r.stdout + '\n' + r.stderr).trim().split(/\r?\n/).slice(-25).join('\n');
        // Test failures are actionable by a human; tool failures usually need setup.
        throw new RunBlockedError(`CI failed on "${cmd}" (exit ${r.code}):\n${tail}`);
      }
    }
    return { outputs: { ci_status: 'passed', ci_commands: commands } };
  }

  private async taskOpenPr(run: RunRecord): Promise<StepResult> {
    if (!this.o.worktrees) throw new Error('open_pr requires the worktree manager');
    const wt = run.worktree ?? (run.outputs['worktree'] as string | undefined);
    const branch = run.branch ?? (run.outputs['branch'] as string | undefined);
    if (!wt || !branch) throw new Error('open_pr requires branch/worktree from agent_implement');

    await this.o.worktrees.push(wt, branch);
    this.log(run, `pushed ${branch}`);

    const issue = await this.o.github.getIssue(run.issue);
    const ciCommands = (run.outputs['ci_commands'] as string[]) ?? [];
    const verification = ciCommands.map((c) => `  ${c.replace(/[^a-z0-9]+/gi, '_')}: passed`).join('\n');
    const body =
      `<!-- agentspec:pr\nrun_id: ${run.runId}\nworkflow: ${run.workflow}\nstep: pr\nagent: coding-agent\n` +
      `verification:\n${verification}\nrequires_human_review: true\n-->\n\n` +
      `Implements #${run.issue} (${issue.title}).\n\n` +
      `All configured checks passed in the isolated worktree. Please review and merge when satisfied.\n\n` +
      `Closes #${run.issue}`;
    const pr = await this.o.github.createPullRequest(`${issue.title}`, body, branch);
    await this.tryLabels(run, ['state:pr-open'], ['state:agent-working']);
    this.log(run, `opened PR #${pr.number}: ${pr.url}`);
    return { outputs: { pull_request: pr.number, pr_url: pr.url } };
  }

  // ---- helpers ---------------------------------------------------------

  private async generate(
    run: RunRecord,
    step: WorkflowStep,
    values: Record<string, string>,
    suffix = '',
  ): Promise<string> {
    const task = TASKS[step.task];
    const promptFile = this.o.prompts.get(step.prompt ?? task?.prompt ?? step.task);
    const filled = fillPrompt(promptFile, values) + suffix;
    const est = estimateTokens(filled);
    const cap = step.context?.max_tokens;
    if (cap && est > cap) {
      throw new Error(`context overflow: ~${est} tokens exceeds step max_tokens ${cap}`);
    }
    const routed = await this.o.router.route(task?.skill ?? 'planner', est);
    this.log(run, `model ${routed.model.name} selected (${routed.reason})`);
    return routed.provider.generate(routed.model, filled);
  }

  private async completeRun(run: RunRecord, wf: Workflow): Promise<void> {
    run.state = 'completed';
    run.currentStep = undefined;
    this.touch(run);
    const outputs = Object.entries(run.outputs)
      .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
      .join('\n');
    try {
      await this.o.github.addComment(
        run.issue,
        `<!-- agentspec:run\nid: ${run.runId}\nworkflow: ${wf.id}\nstate: completed\n-->\n\nRun ${run.runId} completed.\n\n${outputs}`,
      );
    } catch (err) {
      this.log(run, `summary comment failed: ${err instanceof Error ? err.message : err}`);
    }
    this.log(run, 'run completed');
    this.saveState();
  }

  private async tryLabels(run: RunRecord, add: string[], remove: string[]): Promise<void> {
    try {
      if (add.length) await this.o.github.addLabels(run.issue, add);
      for (const l of remove) await this.o.github.removeLabel(run.issue, l);
    } catch (err) {
      this.log(run, `label update warning: ${err instanceof Error ? err.message : err}`);
    }
  }

  private workflowFor(run: RunRecord): Workflow {
    const mission = this.o.spec.missions.find((m) => m.id === run.mission);
    if (!mission) throw new Error(`mission "${run.mission}" no longer defined`);
    return resolveWorkflow(this.o.spec, mission, run.missionWorkflow);
  }

  private mustRun(runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown run "${runId}"`);
    return run;
  }

  private touch(run: RunRecord): void {
    run.updatedAt = now();
  }

  private log(run: RunRecord, msg: string): void {
    run.log.push(`${now()} ${msg}`);
    this.o.logger?.(`[${run.runId}] ${msg}`);
  }

  // ---- persistence (local cache only; GitHub stays canonical) ----------

  private statePath(): string {
    return path.join(this.o.stateDir, 'state.json');
  }

  private saveState(): void {
    fs.mkdirSync(this.o.stateDir, { recursive: true });
    fs.writeFileSync(
      this.statePath(),
      JSON.stringify(
        {
          runs: [...this.runs.values()],
          questions: [...this.questions.values()],
          approvals: [...this.approvals.values()],
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  private loadState(): void {
    if (!fs.existsSync(this.statePath())) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.statePath(), 'utf8')) as {
        runs?: RunRecord[];
        questions?: Question[];
        approvals?: Approval[];
      };
      for (const r of data.runs ?? []) this.runs.set(r.runId, r);
      for (const q of data.questions ?? []) this.questions.set(q.id, q);
      for (const a of data.approvals ?? []) this.approvals.set(a.id, a);
    } catch {
      // Disposable cache: a corrupt state file is discarded, not fatal.
    }
  }
}

// ---- parsing helpers ----------------------------------------------------

export function parseQuestion(text: string): { text: string; options: string[] } {
  const qMatch = text.match(/QUESTION:\s*([\s\S]*?)(?:\r?\nOPTIONS:|$)/);
  const question = (qMatch?.[1] ?? text).trim();
  const options: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Fa-f][.)]\s+(.*\S)\s*$/);
    if (m) options.push(m[1]);
  }
  return { text: question, options };
}

export function parseJsonIssueArray(raw: string): { title: string; body: string }[] {
  let text = raw.replace(/```[a-z]*\r?\n?/gi, '').replace(/```/g, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON array found in model output');
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('model output is not a non-empty JSON array');
  return parsed.map((item, i) => {
    const it = item as { title?: unknown; body?: unknown };
    if (typeof it.title !== 'string' || typeof it.body !== 'string') {
      throw new Error(`array item ${i} is missing string title/body`);
    }
    return { title: it.title, body: it.body };
  });
}

function buildImplementPrompt(
  issueNumber: number,
  title: string,
  body: string,
  prd: string,
  testCommands: string[],
  runId: string,
): string {
  return [
    `You are implementing GitHub issue #${issueNumber} in this repository checkout (an isolated git worktree on a dedicated branch).`,
    '',
    `## Issue: ${title}`,
    '',
    body,
    prd ? `\n## Related PRD\n\n${prd}` : '',
    '',
    '## Rules',
    '',
    '- Work only inside this directory.',
    '- Write a failing test first where practical, then make it pass.',
    testCommands.length
      ? `- Verify with the project's test commands before finishing: ${testCommands.join(' && ')}`
      : '- Run any existing tests before finishing.',
    '- Make small, focused commits. End every commit message with:',
    '',
    `  AgentSpec-Run: ${runId}`,
    `  Issue: #${issueNumber}`,
    '',
    '- NEVER push, never touch branches other than the current one, never modify git config or CI workflow files.',
    '- When done, reply with a short summary of what you changed and how you verified it.',
  ].join('\n');
}

function questionComment(q: Question, run: RunRecord, step: WorkflowStep): string {
  const options = q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
  return (
    `<!-- agentspec:question\nid: ${q.id}\nrun_id: ${run.runId}\nworkflow: ${run.workflow}\nstep_id: ${step.id}\n-->\n\n` +
    `${q.text}\n\nOptions:\n\n${options}\n\n` +
    `Answer in the cockpit, or reply with a comment whose first line is the option letter (or \`custom: ...\`).`
  );
}
