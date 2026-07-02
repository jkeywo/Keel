import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ClaudeCodeProvider,
  CodexCliProvider,
  isQuotaError,
  parseClaudeJson,
  type ModelDef,
} from '../src/models.js';
import type { CliResult, CliRunner } from '../src/cli.js';

const model = (over: Partial<ModelDef> = {}): ModelDef => ({
  name: 'subscription:claude-sonnet',
  provider: 'claude_code',
  model: 'sonnet',
  unlimited: true,
  skills: ['planner'],
  ...over,
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'keel-prov-'));

describe('parseClaudeJson / isQuotaError', () => {
  it('extracts the result field', () => {
    expect(parseClaudeJson(JSON.stringify({ type: 'result', result: 'hello', is_error: false }))).toBe('hello');
  });

  it('throws on error payloads and non-JSON', () => {
    expect(() => parseClaudeJson(JSON.stringify({ is_error: true, result: 'boom' }))).toThrow(/boom/);
    expect(() => parseClaudeJson('not json at all')).toThrow(/unparseable/);
  });

  it('recognises usage-limit shapes', () => {
    expect(isQuotaError("You've hit your usage limit. Your limit resets at 5pm")).toBe(true);
    expect(isQuotaError('everything is fine')).toBe(false);
  });
});

describe('ClaudeCodeProvider', () => {
  it('generates via claude -p with the prompt on stdin', async () => {
    const calls: { cmd: string; args: string[]; input?: string }[] = [];
    const stub: CliRunner = async (cmd, args, opts) => {
      calls.push({ cmd, args, input: opts?.input });
      if (args[0] === '--version') return { code: 0, stdout: '2.1.185', stderr: '' };
      return { code: 0, stdout: JSON.stringify({ result: 'generated text', is_error: false }), stderr: '' };
    };
    const p = new ClaudeCodeProvider({ scratchDir: tmp(), run: stub });
    expect(await p.available()).toBe(true);
    expect(await p.generate(model(), 'the prompt')).toBe('generated text');
    const gen = calls[1];
    expect(gen.args).toContain('-p');
    expect(gen.args).toContain('sonnet');
    expect(gen.input).toBe('the prompt');
  });

  it('enters cooldown on usage-limit errors so the router falls through', async () => {
    const stub: CliRunner = async (_cmd, args) =>
      args[0] === '--version'
        ? { code: 0, stdout: 'ok', stderr: '' }
        : { code: 1, stdout: '', stderr: 'You have hit your usage limit.' };
    const p = new ClaudeCodeProvider({ scratchDir: tmp(), run: stub });
    expect(await p.available()).toBe(true);
    await expect(p.generate(model(), 'x')).rejects.toThrow(/usage limit/i);
    expect(await p.available()).toBe(false); // cooldown active
  });

  it('is unavailable when the binary is missing', async () => {
    const stub: CliRunner = async () => {
      throw new Error('ENOENT');
    };
    const p = new ClaudeCodeProvider({ scratchDir: tmp(), run: stub });
    expect(await p.available()).toBe(false);
  });
});

describe('CodexCliProvider', () => {
  it('reads the result from --output-last-message', async () => {
    const scratch = tmp();
    const stub: CliRunner = async (_cmd, args): Promise<CliResult> => {
      const flat = args.join(' ');
      if (flat.includes('--version')) return { code: 0, stdout: 'codex 1.0', stderr: '' };
      const outIdx = args.indexOf('--output-last-message');
      fs.writeFileSync(args[outIdx + 1], 'codex answer', 'utf8');
      return { code: 0, stdout: '', stderr: '' };
    };
    const auth = path.join(scratch, 'auth.json');
    fs.writeFileSync(auth, '{}', 'utf8');
    const p = new CodexCliProvider({ scratchDir: scratch, run: stub, authPath: auth });
    expect(await p.available()).toBe(true);
    expect(await p.generate(model({ provider: 'codex_cli', model: undefined }), 'prompt')).toBe('codex answer');
  });

  it('is unavailable without an auth file', async () => {
    const scratch = tmp();
    const stub: CliRunner = async () => ({ code: 0, stdout: '', stderr: '' });
    const p = new CodexCliProvider({
      scratchDir: scratch,
      run: stub,
      authPath: path.join(scratch, 'missing-auth.json'),
    });
    expect(await p.available()).toBe(false);
  });
});
