# Keel

Keel is a local personal engineering cockpit: it runs agentic workflows
against a GitHub repository, keeps GitHub as the canonical project database,
and asks the human operator instead of guessing. It is the implementation of
the **Phoenix Agentic Engineering Suite** specified in [`Spec/`](Spec/MANIFEST.md).

## Current state — Slice 1 walking skeleton

One workflow works end to end (`feature-prd`):

```text
feature issue → grill (structured questions) → PRD draft (human approval)
             → decomposition into ready-for-work child issues
```

- **Runtime**: AgentSpec loading + validation, run state machine,
  HITL question/answer and approval gates, model routing (Ollama with
  budget checks, mock fallback), local state cache under `~/.agentspec/keel/`.
- **Cockpit**: Mission Board, Inbox (questions + approvals), Runs table at
  `http://localhost:4400`.
- **GitHub**: comments, labels, and issue creation via the authenticated
  `gh` CLI, with `agentspec:*` metadata blocks per the spec.

Not yet built: worktrees, code-writing workflows, CI integration,
label-based triggers, context indexing. See
[`Spec/08-ImplementationRoadmap.md`](Spec/08-ImplementationRoadmap.md).

## Quickstart

On Windows, double-click **`run-keel.bat`** (installs dependencies on first
run, starts the cockpit, opens the browser). Add `--dry-run` for a safe
sandbox. Full instructions, prerequisites, and troubleshooting:
[`docs/SETUP.md`](docs/SETUP.md).

From a terminal:

```bash
npm install
npm test            # unit tests (mocked GitHub + models)
npm run dry-run     # cockpit against a mock GitHub — safe to click around
npm run dev         # the real thing: jkeywo/Keel via gh, local models via Ollama
```

Then open <http://localhost:4400>, pick the mission, start `feature-prd`
against a feature-request issue number, and answer the questions that land
in the Inbox.

## Configuration

Optional machine config at `~/.agentspec/config.yaml` (never committed):

```yaml
repositories:
  keel:
    path: C:/Coding/Keel
    github: jkeywo/Keel
providers:
  ollama:
    url: http://localhost:11434
```

Defaults work from a checkout of this repo with `gh` authenticated and
Ollama on the default port. `KEEL_PORT` / `KEEL_STATE_DIR` env vars override
the port and state location.

## Repository layout

Per [`Spec/06-RepositorySpec.md`](Spec/06-RepositorySpec.md):

```text
.agent/          workflows, prompts, models.yaml, labels.yaml, context/
docs/prds/       PRDs written by the feature-prd workflow
projectspec.yaml build/test environment description
src/             runtime + cockpit (TypeScript, Node >= 20)
test/            vitest suites
Spec/            the specification suite (canonical)
```
