import path from 'node:path';
import { loadConfig } from './config.js';
import { loadAgentSpec } from './agentspec.js';
import { PromptLibrary } from './prompts.js';
import {
  ClaudeCodeProvider,
  CodexCliProvider,
  loadModelsConfig,
  ModelRouter,
  MockProvider,
  OllamaProvider,
  type ModelProvider,
} from './models.js';
import { GhCliAdapter, MockGitHub, type GitHubAdapter } from './github.js';
import { Runtime } from './runtime.js';
import { WorktreeManager } from './worktrees.js';
import { AgentExecutor } from './agents.js';
import { createServer } from './server.js';

const dryRun = process.argv.includes('--dry-run');
const cfg = loadConfig({ dryRun });

const agentDir = path.join(cfg.repoPath, '.agent');
const spec = loadAgentSpec(agentDir);
const prompts = PromptLibrary.load(path.join(agentDir, 'prompts'));
const modelsCfg = loadModelsConfig(path.join(agentDir, 'models.yaml'));

const stateDir = cfg.dryRun ? path.join(cfg.stateDir, 'dry-run') : cfg.stateDir;
const scratchDir = path.join(stateDir, 'scratch');

const providers: Record<string, ModelProvider> = {
  ollama: new OllamaProvider(cfg.ollamaUrl),
  mock: new MockProvider(),
};
if (cfg.claudeCode.enabled) {
  providers.claude_code = new ClaudeCodeProvider({ scratchDir, command: cfg.claudeCode.command });
}
if (cfg.codex.enabled) {
  providers.codex_cli = new CodexCliProvider({
    scratchDir,
    command: cfg.codex.command,
    authPath: cfg.codex.authPath,
  });
}
const router = new ModelRouter(modelsCfg, providers);

let github: GitHubAdapter;
if (cfg.dryRun) {
  const mock = new MockGitHub();
  const n = mock.seedIssue(
    'Add run filtering to the Mission Board',
    'As the operator I want to filter runs by state so the board stays readable as history grows.',
    ['type:feature'],
  );
  console.log(`dry-run: mock GitHub seeded with issue #${n}`);
  github = mock;
} else {
  github = new GhCliAdapter(cfg.githubRepo);
}

const worktrees = new WorktreeManager({
  repoPath: cfg.repoPath,
  baseDir: path.join(stateDir, 'worktrees'),
});
if (cfg.agent.mode === 'host') {
  console.log(
    'agent executor: HOST mode (no claude_code oauth_token configured). ' +
      'The coding agent runs on this machine with a permission allowlist; ' +
      'run `claude setup-token` and add it to ~/.agentspec/config.yaml for container isolation.',
  );
}
const agents = new AgentExecutor({
  mode: cfg.agent.mode,
  image: cfg.agent.image,
  oauthToken: cfg.claudeCode.oauthToken,
  codexAuthDir: path.dirname(cfg.codex.authPath),
  prefer: cfg.agent.prefer,
  logger: (m) => console.log(m),
});

const rt = new Runtime({
  spec,
  prompts,
  router,
  github,
  repoPath: cfg.dryRun ? path.join(stateDir, 'repo') : cfg.repoPath,
  stateDir,
  worktrees,
  agents,
  logger: (m) => console.log(m),
});

createServer(rt).listen(cfg.port, () => {
  const mode = cfg.dryRun ? 'dry run — mock GitHub, no real writes' : `repo: ${cfg.githubRepo}`;
  console.log(`Keel cockpit: http://localhost:${cfg.port} (${mode})`);
});
