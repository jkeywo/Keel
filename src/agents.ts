import { runCli, type CliRunner } from './cli.js';
import { isQuotaError, parseClaudeJson } from './models.js';

export interface AgentExecutorOptions {
  /** docker = container is the sandbox; host = permission-allowlisted claude -p. */
  mode: 'docker' | 'host';
  image: string;
  oauthToken?: string;
  codexAuthDir?: string;
  prefer: ('claude_code' | 'codex')[];
  maxTurns?: number;
  timeoutMs?: number;
  run?: CliRunner;
  logger?: (msg: string) => void;
}

/** Tools the host-mode agent may use without prompts: file edits in the
 * worktree cwd plus the build/test/commit commands it needs. No push. */
const HOST_ALLOWED_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep', 'LS',
  'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)',
  'Bash(cargo:*)',
  'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git status)', 'Bash(git diff:*)', 'Bash(git log:*)',
];

/**
 * Runs a subscription-backed coding agent against an isolated worktree.
 * Docker mode mounts only the worktree; --dangerously-skip-permissions is
 * safe *because* the container is the sandbox (Spec/04 §5.7 maps to it).
 */
export class AgentExecutor {
  constructor(private o: AgentExecutorOptions) {}

  private get run(): CliRunner {
    return this.o.run ?? runCli;
  }

  private log(msg: string) {
    this.o.logger?.(`[agent] ${msg}`);
  }

  async implement(runId: string, worktree: string, prompt: string): Promise<string> {
    const errors: string[] = [];
    for (const agent of this.o.prefer) {
      try {
        this.log(`trying ${agent} (${this.o.mode} mode)`);
        return agent === 'claude_code'
          ? await this.runClaude(runId, worktree, prompt)
          : await this.runCodex(runId, worktree, prompt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${agent}: ${msg}`);
        this.log(`${agent} failed: ${msg.slice(0, 200)}`);
        if (!isQuotaError(msg) && this.o.prefer.indexOf(agent) === this.o.prefer.length - 1) break;
      }
    }
    throw new Error(`all coding agents failed:\n${errors.join('\n')}`);
  }

  private async runClaude(runId: string, worktree: string, prompt: string): Promise<string> {
    const claudeArgs = [
      '-p', '--output-format', 'json',
      '--max-turns', String(this.o.maxTurns ?? 40),
    ];
    let r;
    if (this.o.mode === 'docker') {
      if (!this.o.oauthToken) {
        throw new Error('docker mode needs providers.claude_code.oauth_token (run `claude setup-token`)');
      }
      r = await this.docker(
        runId,
        [
          '-e', `CLAUDE_CODE_OAUTH_TOKEN=${this.o.oauthToken}`,
          this.o.image,
          'claude', ...claudeArgs, '--dangerously-skip-permissions',
        ],
        worktree,
        prompt,
      );
    } else {
      const args = [...claudeArgs, '--permission-mode', 'acceptEdits', '--allowedTools', ...HOST_ALLOWED_TOOLS];
      r = await this.run('claude', args, { input: prompt, cwd: worktree, timeoutMs: this.timeout });
    }
    if (r.code !== 0) throw new Error(`claude agent exited ${r.code}: ${(r.stderr || r.stdout).slice(0, 400)}`);
    return parseClaudeJson(r.stdout);
  }

  private async runCodex(runId: string, worktree: string, prompt: string): Promise<string> {
    const codexArgs = ['exec', '--skip-git-repo-check', '-'];
    let r;
    if (this.o.mode === 'docker') {
      if (!this.o.codexAuthDir) throw new Error('docker mode needs a codex auth directory to mount');
      r = await this.docker(
        runId,
        [
          '-v', `${this.o.codexAuthDir}:/root/.codex`,
          this.o.image,
          'codex', 'exec', '--sandbox', 'danger-full-access', '--skip-git-repo-check', '-',
        ],
        worktree,
        prompt,
      );
    } else {
      const args = ['/c', 'codex', 'exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-C', worktree, '-'];
      r = process.platform === 'win32'
        ? await this.run('cmd', args, { input: prompt, timeoutMs: this.timeout })
        : await this.run('codex', codexArgs.slice(0, -1).concat(['-C', worktree, '-']), { input: prompt, timeoutMs: this.timeout });
    }
    if (r.code !== 0) throw new Error(`codex agent exited ${r.code}: ${(r.stderr || r.stdout).slice(0, 400)}`);
    return r.stdout.slice(-2000);
  }

  private get timeout() {
    return this.o.timeoutMs ?? 30 * 60_000;
  }

  private async docker(runId: string, imageAndCmd: string[], worktree: string, input: string) {
    const name = `keel-${runId}`;
    const args = [
      'run', '--rm', '-i', '--name', name,
      '-v', `${worktree}:/work`, '-w', '/work',
      ...gitIdentityEnv(),
      ...imageAndCmd,
    ];
    try {
      return await this.run('docker', args, { input, timeoutMs: this.timeout });
    } catch (err) {
      // Timeout kills the docker CLI, not the container — clean it up.
      await this.run('docker', ['kill', name], { timeoutMs: 15_000 }).catch(() => {});
      throw err;
    }
  }
}

function gitIdentityEnv(): string[] {
  const name = process.env.GIT_AUTHOR_NAME ?? 'Keel Agent';
  const email = process.env.GIT_AUTHOR_EMAIL ?? 'keel-agent@localhost';
  return [
    '-e', `GIT_AUTHOR_NAME=${name}`,
    '-e', `GIT_AUTHOR_EMAIL=${email}`,
    '-e', `GIT_COMMITTER_NAME=${name}`,
    '-e', `GIT_COMMITTER_EMAIL=${email}`,
  ];
}
