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
  const providers = (file.providers ?? {}) as { ollama?: { url?: string } };

  return {
    repoPath: overrides.repoPath ?? keelRepo.path ?? process.cwd(),
    githubRepo: overrides.githubRepo ?? keelRepo.github ?? 'jkeywo/Keel',
    stateDir:
      overrides.stateDir ?? process.env.KEEL_STATE_DIR ?? path.join(home, '.agentspec', 'keel'),
    port: overrides.port ?? Number(process.env.KEEL_PORT ?? 4400),
    ollamaUrl: overrides.ollamaUrl ?? providers.ollama?.url ?? 'http://localhost:11434',
    dryRun: overrides.dryRun ?? false,
  };
}
