import path from 'node:path';
import { loadConfig } from './config.js';
import { loadAgentSpec } from './agentspec.js';
import { PromptLibrary } from './prompts.js';
import { loadModelsConfig, ModelRouter, MockProvider, OllamaProvider } from './models.js';
import { GhCliAdapter, MockGitHub, type GitHubAdapter } from './github.js';
import { Runtime } from './runtime.js';
import { createServer } from './server.js';

const dryRun = process.argv.includes('--dry-run');
const cfg = loadConfig({ dryRun });

const agentDir = path.join(cfg.repoPath, '.agent');
const spec = loadAgentSpec(agentDir);
const prompts = PromptLibrary.load(path.join(agentDir, 'prompts'));
const modelsCfg = loadModelsConfig(path.join(agentDir, 'models.yaml'));
const router = new ModelRouter(modelsCfg, {
  ollama: new OllamaProvider(cfg.ollamaUrl),
  mock: new MockProvider(),
});

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

// In dry-run mode all file outputs (PRDs) land in the state dir, not the repo.
const stateDir = cfg.dryRun ? path.join(cfg.stateDir, 'dry-run') : cfg.stateDir;
const rt = new Runtime({
  spec,
  prompts,
  router,
  github,
  repoPath: cfg.dryRun ? path.join(stateDir, 'repo') : cfg.repoPath,
  stateDir,
  logger: (m) => console.log(m),
});

createServer(rt).listen(cfg.port, () => {
  const mode = cfg.dryRun ? 'dry run — mock GitHub, no real writes' : `repo: ${cfg.githubRepo}`;
  console.log(`Keel cockpit: http://localhost:${cfg.port} (${mode})`);
});
