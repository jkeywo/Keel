import fs from 'node:fs';
import path from 'node:path';
import { runCli, type CliRunner } from './cli.js';

export interface WorktreeInfo {
  path: string;
  branch: string;
  baseCommit: string;
}

/**
 * Isolated git worktrees for code-producing runs (Spec/04 §5.6).
 * One worktree per run under `<baseDir>/<runId>`, branch `agent/<issue>-<slug>`.
 * Never touches the user's active checkout; never operates on main.
 */
export class WorktreeManager {
  constructor(
    private o: { repoPath: string; baseDir: string; run?: CliRunner },
  ) {}

  private get run(): CliRunner {
    return this.o.run ?? runCli;
  }

  private async git(args: string[], cwd: string): Promise<string> {
    const r = await this.run('git', args, { cwd, timeoutMs: 60_000 });
    if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).slice(0, 400)}`);
    return r.stdout;
  }

  async create(runId: string, issue: number, slug: string): Promise<WorktreeInfo> {
    const branch = `agent/${issue}-${slug}`;
    const wtPath = path.join(this.o.baseDir, runId);
    if (fs.existsSync(wtPath)) throw new Error(`worktree already exists: ${wtPath}`);
    const exists = await this.run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: this.o.repoPath,
      timeoutMs: 30_000,
    });
    if (exists.code === 0) throw new Error(`branch ${branch} already exists; remove it or use a new issue slug`);
    fs.mkdirSync(this.o.baseDir, { recursive: true });
    await this.git(['worktree', 'add', wtPath, '-b', branch], this.o.repoPath);
    const baseCommit = (await this.git(['rev-parse', 'HEAD'], wtPath)).trim();
    return { path: wtPath, branch, baseCommit };
  }

  /** True if the worktree has uncommitted changes. */
  async isDirty(wtPath: string): Promise<boolean> {
    return (await this.git(['status', '--porcelain'], wtPath)).trim().length > 0;
  }

  /** Number of commits the worktree branch has on top of its base. */
  async commitsSince(wtPath: string, baseCommit: string): Promise<number> {
    return Number((await this.git(['rev-list', '--count', `${baseCommit}..HEAD`], wtPath)).trim());
  }

  /** Commit everything outstanding (used to salvage agent output that wasn't committed). */
  async commitAll(wtPath: string, message: string): Promise<void> {
    await this.git(['add', '-A'], wtPath);
    await this.git(['commit', '-m', message], wtPath);
  }

  async push(wtPath: string, branch: string): Promise<void> {
    await this.git(['push', '-u', 'origin', branch], wtPath);
  }

  /** Removes the worktree directory; the branch is left for the PR. */
  async remove(runId: string, force = false): Promise<void> {
    const wtPath = path.join(this.o.baseDir, runId);
    if (!fs.existsSync(wtPath)) return;
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(wtPath);
    await this.git(args, this.o.repoPath);
  }
}
