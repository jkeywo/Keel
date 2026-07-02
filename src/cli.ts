import { spawn } from 'node:child_process';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CliOptions {
  input?: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export type CliRunner = (cmd: string, args: string[], opts?: CliOptions) => Promise<CliResult>;

function exec(cmd: string, args: string[] | undefined, opts: CliOptions, shell: boolean): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const spawnOpts = {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      shell,
    };
    const child = shell ? spawn(cmd, spawnOpts) : spawn(cmd, args ?? [], spawnOpts);
    let out = '';
    let err = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new Error(`${cmd} timed out after ${Math.round(opts.timeoutMs! / 1000)}s`)));
      }, opts.timeoutMs);
    }
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => finish(() => reject(e)));
    child.on('close', (code) => finish(() => resolve({ code: code ?? -1, stdout: out, stderr: err })));
    if (opts.input !== undefined) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

/**
 * Shared subprocess runner: stdin input, timeout with kill, captured output.
 * Providers and tasks take a CliRunner so tests can stub the CLI.
 */
export const runCli: CliRunner = (cmd, args, opts = {}) => exec(cmd, args, opts, false);

/**
 * Run a whole shell command line (for projectspec commands). Uses the
 * platform shell directly — passing a command line through `cmd /c` as a
 * spawn argument mangles embedded quotes on Windows.
 */
export const runShell = (command: string, opts: CliOptions = {}): Promise<CliResult> =>
  exec(command, undefined, opts, true);
