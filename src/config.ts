import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

export interface KeelConfig {
  repoPath: string;
  githubRepo: string;
  stateDir: string;
  port: number;
  ollamaUrl: string;
  dryRun: boolean;
  claudeCode: {
    enabled: boolean;
    command: string;
    /** Long-lived token from `claude setup-token`, used by the Docker agent. */
    oauthToken?: string;
  };
  codex: {
    enabled: boolean;
    command: string;
    authPath: string;
  };
  agent: {
    /** docker = containerised coding agent; host = permission-allowlisted claude -p on the host. */
    mode: 'docker' | 'host';
    image: string;
    prefer: ('claude_code' | 'codex')[];
  };
}

/**
 * Local machine config lives at ~/.agentspec/config.yaml (never committed,
 * see Spec/04-RuntimeSpec.md §7.1). Everything has a workable default so a
 * fresh checkout runs with no setup.
 */
export function loadConfig(overrides: Partial<KeelConfig> = {}): KeelConfig {
  const home = os.homedir();
  const cfgPath = path.join(home, '.agentspec', 'config.yaml');
  let file: Record<string, unknown> = {};
  if (fs.existsSync(cfgPath)) {
    file = (parse(fs.readFileSync(cfgPath, 'utf8')) as Record<string, unknown>) ?? {};
  }
  const repos = (file.repositories ?? {}) as Record<string, { path?: string; github?: string }>;
  const keelRepo = repos.keel ?? {};
  const providers = (file.providers ?? {}) as {
    ollama?: { url?: string };
    claude_code?: { enabled?: boolean; command?: string; oauth_token?: string };
    codex?: { enabled?: boolean; command?: string; auth_path?: string };
  };
  const agent = (file.agent ?? {}) as {
    mode?: 'docker' | 'host';
    image?: string;
    prefer?: ('claude_code' | 'codex')[];
  };

  const claudeToken = providers.claude_code?.oauth_token ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;

  return {
    repoPath: overrides.repoPath ?? keelRepo.path ?? process.cwd(),
    githubRepo: overrides.githubRepo ?? keelRepo.github ?? 'jkeywo/Keel',
    stateDir:
      overrides.stateDir ?? process.env.KEEL_STATE_DIR ?? path.join(home, '.agentspec', 'keel'),
    port: overrides.port ?? Number(process.env.KEEL_PORT ?? 4400),
    ollamaUrl: overrides.ollamaUrl ?? providers.ollama?.url ?? 'http://localhost:11434',
    dryRun: overrides.dryRun ?? false,
    claudeCode: {
      enabled: providers.claude_code?.enabled ?? true,
      command: providers.claude_code?.command ?? 'claude',
      oauthToken: claudeToken,
    },
    codex: {
      enabled: providers.codex?.enabled ?? true,
      command: providers.codex?.command ?? 'codex',
      authPath: providers.codex?.auth_path ?? path.join(home, '.codex', 'auth.json'),
    },
    agent: {
      // Docker needs a token the container can use; without one, fall back
      // to host mode (permission-allowlisted, worktree cwd) with a warning.
      mode: agent.mode ?? (claudeToken ? 'docker' : 'host'),
      image: agent.image ?? 'keel-agent',
      prefer: agent.prefer ?? ['claude_code', 'codex'],
    },
  };
}
