# 04 — RuntimeSpec

**Status:** Draft v0.1  
**Depends on:** `00-EngineeringVision.md`, `01-AgentSpec.md`, `02-GameSpec.md`, `03-CockpitSpec.md`

---

## 1. Purpose

RuntimeSpec defines the local execution engine for the Phoenix Agentic Engineering Suite.

The runtime is the component that interprets AgentSpec, reads and writes GitHub state, loads GameSpec and repository context, chooses models, manages isolated worktrees, runs tools, handles human-in-the-loop pauses, and reports live status to the cockpit.

It answers:

> How does the local system actually execute missions and workflows?

RuntimeSpec does not define the workflow language itself; that is AgentSpec. It does not define the game design model; that is GameSpec. It does not define the operator interface; that is CockpitSpec.

---

## 2. Design Goals

1. **GitHub-first durability.** All durable state must be written to GitHub. Local runtime state is cache, process state, locks, secrets, or logs.
2. **Local-first execution.** The runtime executes locally, against local repositories, local worktrees, local models where possible, and the user’s GitHub identity.
3. **Stateless agents.** Every agent invocation receives assembled context. Agents do not rely on hidden long-term memory.
4. **Capability enforcement.** The runtime enforces AgentSpec capabilities before any tool, git, build, browser, asset, or network action.
5. **Worktree isolation.** Agent runs never modify the user’s active working tree directly.
6. **Context-budget awareness.** The runtime must know each model’s safe prompt budget and adapt context assembly before invoking a model.
7. **Human control.** Human approval is required for merges, destructive actions, design decisions, unresolved ambiguities, and manual validation.
8. **Reproducibility.** Each run records enough metadata to understand what was attempted, what context was used, which model was selected, what files changed, and what verification ran.
9. **Provider neutrality.** Model providers are adapters. The runtime should work with local models, OpenRouter free models, and manual subscription escalation without binding AgentSpec to any one provider.
10. **Incremental usefulness.** The first runtime should support PRD grilling and issue decomposition before full autonomous coding.

---

## 3. Runtime Responsibilities

The runtime is responsible for:

- Loading repository configuration.
- Discovering AgentSpec missions and workflows.
- Reading GitHub issues, comments, labels, PRs, branches, and CI status.
- Reading GameSpec and generated context documents.
- Creating workflow runs.
- Building context packs for agent invocations.
- Estimating prompt size and checking model context budgets.
- Routing model requests.
- Executing local commands within declared capabilities.
- Creating and managing git worktrees.
- Applying file changes.
- Committing to agent branches.
- Opening and updating pull requests.
- Posting structured GitHub comments.
- Recording HITL questions and resuming runs after answers.
- Tracking run state for the cockpit.
- Producing run summaries and audit records.
- Handling retries, failures, cancellations, and blocked states.

The runtime is not responsible for:

- Deciding final product direction.
- Merging PRs without human approval.
- Silently changing GameSpec.
- Replacing GitHub as the canonical database.
- Maintaining hidden agent memory.
- Automating unsupported subscription-product web UIs.

---

## 4. High-Level Architecture

```text
Cockpit UI
  ↓
Runtime API
  ↓
Scheduler
  ↓
Workflow Interpreter
  ↓
Run Manager
  ↓
Task Executor
  ↓
Tool Adapters
```

Supporting services:

```text
GitHub Adapter
Model Router
Context Assembler
Prompt Budgeter
Worktree Manager
Capability Sandbox
Command Runner
HITL Manager
Audit Logger
Repository Indexer
GameSpec Adapter
```

The runtime should be implemented as a local service. The cockpit communicates with it over a local API, such as HTTP/WebSocket, Unix socket, or named pipe. The exact transport is an implementation detail, but the runtime must support live status updates and command-style interactions.

---

## 5. Core Runtime Components

### 5.1 Scheduler

The scheduler detects or receives triggers and creates runs. Triggers are declared per mission workflow in AgentSpec (see `01-AgentSpec.md`, Triggers).

Supported trigger types:

```yaml
manual:
  source: cockpit

github_label:
  label: type:feature

github_comment:
  command: /agent start feature-prd

scheduled:
  cron: "0 9 * * *"

post_merge:
  branch: main
```

For v1, the required trigger type is `manual`. GitHub label and comment triggers may be added once the cockpit workflow is stable.

The scheduler must prevent duplicate runs for the same issue/workflow unless explicitly requested.

---

### 5.2 Workflow Interpreter

The workflow interpreter loads AgentSpec and resolves:

- mission definitions
- workflow definitions
- step ordering
- required task types
- capability requirements
- context profiles
- HITL flags
- verification gates
- outputs consumed by later steps

It validates that:

- referenced workflows exist
- task types exist
- capability requests are allowed by the mission
- required inputs are present
- context profiles are well-formed
- dangerous capabilities are not granted accidentally

The interpreter does not execute tasks directly. It creates a run plan for the Run Manager.

---

### 5.3 Run Manager

The Run Manager owns the lifecycle of a single workflow run.

Run states:

```text
pending
running
waiting_for_human
blocked
failed
cancelled
completed
```

A run record contains:

```yaml
run_id: run-2026-07-01-004
mission: fleet-sensors
workflow: feature-prd
source:
  type: github_issue
  id: 42
state: running
current_step: prd
worktree: ~/.agentspec/worktrees/project-phoenix-v2/run-2026-07-01-004
branch: agent/42-radar-contact-classification
created_at: 2026-07-01T12:00:00Z
updated_at: 2026-07-01T12:05:00Z
```

Durable run summaries are written to GitHub. Local run state may be cached for responsiveness, but must be reconstructible from GitHub comments, labels, branches, PRs, and committed files.

---

### 5.4 Task Executor

The Task Executor runs individual workflow steps.

For each step it:

1. Resolves the task template.
2. Checks capability requirements.
3. Assembles context.
4. Checks context budget.
5. Chooses a model or escalation path.
6. Invokes the model or executes the task directly.
7. Applies tool actions only if allowed.
8. Runs verification if required.
9. Captures output.
10. Updates GitHub and runtime state.

Tasks may produce outputs such as:

```yaml
outputs:
  prd_file: docs/prds/042-radar-contacts.md
  child_issues:
    - 43
    - 44
  branch: agent/42-radar-contact-classification
  pull_request: 57
```

---

### 5.5 GitHub Adapter

The GitHub Adapter abstracts all GitHub operations.

Required operations:

- read issue
- list issues
- create issue
- update issue
- add labels
- remove labels
- read comments
- add comment
- edit comment
- read pull request
- create pull request
- update pull request
- read CI/check status
- list branches
- read file from repository
- commit file changes
- read wiki page where supported

For v1, the runtime may use the GitHub CLI (`gh`) or the GitHub REST API with the user’s token. Actions appear as the user, not as a bot.

The adapter must respect GitHub API rate limits (5,000 requests/hour for a user token). It should use conditional requests (ETags / `If-None-Match`, which cost no quota when nothing changed), poll only issues with active runs, back off idle repositories, and surface remaining-quota status to the cockpit. A webhook listener is future work (§13); until then, polling cadence is a config value, not a constant.

All comments created by the runtime must include structured AgentSpec metadata where relevant.

Example run summary:

```markdown
<!-- agentspec:run
id: run-2026-07-01-004
workflow: feature-prd
step: prd
agent: prd-writer
state: completed
-->

Summary:
- Drafted PRD from feature request and accepted answers.
- Wrote `docs/prds/042-radar-contacts.md`.
- Next step: decompose into implementation issues.
```

---

### 5.6 Worktree Manager

The Worktree Manager isolates implementation runs.

It must:

- create a new branch for each code-producing run
- create a git worktree for the branch
- ensure the worktree is clean before task execution
- prevent two runs from using the same branch or worktree
- record worktree path in the local run state
- avoid touching the user’s active checkout
- clean up worktrees only after explicit approval or safe completion

Branch naming convention:

```text
agent/<issue-number>-<short-title>
```

Examples:

```text
agent/42-radar-contact-classification
agent/57-fix-wasm-asset-loading
```

No runtime task may push to `main`.

No runtime task may merge a PR.

---

### 5.7 Capability Sandbox

The Capability Sandbox enforces what a task may do.

Capability groups:

```yaml
read:
  - read repository files
  - read GitHub issues
  - read PRs
  - read CI logs

edit:
  - modify files in worktree
  - create files
  - delete files in worktree
  - run formatters

git:
  - create branch
  - commit
  - push agent branch
  - create issue
  - open PR
  - update PR description
  - comment on issue
  - label issue

build:
  - cargo fmt
  - cargo check
  - cargo test
  - cargo clippy
  - wasm build
  - existing CI-equivalent scripts

browser:
  - launch local browser
  - capture screenshot
  - collect console logs
  - run Playwright or equivalent if configured

asset:
  - run asset validation
  - run asset conversion
  - run texture or GLTF tooling

dangerous:
  - force push
  - delete branches
  - rewrite history
  - edit secrets
  - delete workflow files
```

The `dangerous` capability is disabled by default and should not be used in v1.

The sandbox must reject undeclared actions before execution, not after.

---

### 5.8 Command Runner

The Command Runner executes local commands.

It must record:

- command
- working directory
- start time
- end time
- exit code
- stdout summary
- stderr summary
- full log path
- capability authorisation

Commands should have timeouts. Long-running commands enter `blocked` or `failed` depending on whether the user can intervene.

The runtime must distinguish:

```text
command failed because tests failed
```

from

```text
command failed because the tool could not run
```

Test failures may be actionable. Tool failures may require human setup.

---

### 5.9 Context Assembler

The Context Assembler builds model input from canonical and generated sources.

Inputs may include:

- source GitHub issue
- issue comments
- HITL answers
- PRD
- GameSpec excerpt
- linked ADRs
- generated Repository Index
- relevant source files
- failing test logs
- CI output
- previous run summaries
- manual notes

Context profiles from AgentSpec guide assembly:

```yaml
context:
  budget: medium
  strategy: focused
  required_sources:
    - issue
    - prd
    - gamespec_excerpt
    - relevant_files
  max_files: 6
  max_tokens: 12000
```

The assembler must not blindly include whole repositories. It should prefer:

1. explicit links
2. files touched by related issues/PRs
3. code search results
4. repo-map references
5. user-provided files
6. generated summaries

---

### 5.10 Prompt Budgeter

The Prompt Budgeter estimates context size before model invocation.

It must know:

- selected model context window
- safe prompt budget
- reserved output budget
- system prompt size
- tool wrapper overhead
- context source sizes
- expected response size

Use `safe_prompt_budget`, not advertised context window.

Example model metadata:

```yaml
models:
  local:qwen3-coder:
    provider: ollama
    context_window: 32768
    safe_prompt_budget: 24000
    reserved_output_budget: 4000

  local:small-fast:
    provider: ollama
    context_window: 8192
    safe_prompt_budget: 6000
    reserved_output_budget: 1500

  manual:gemini:
    provider: manual
    unlimited: true
```

Models declaring `unlimited: true` (manual escalation targets) bypass budget checks; the budgeter still records the estimated prompt size in the escalation pack so the user knows what they are pasting.

If estimated prompt size exceeds budget, the runtime chooses one of:

- trim optional context
- summarise context
- reduce file count
- split task
- use map-reduce
- ask human to scope
- escalate to larger model
- block with a context-overflow Inbox item

The runtime must record the chosen strategy.

---

### 5.11 Model Router

The Model Router chooses a model for an agent invocation.

Inputs:

```yaml
agent: tdd-developer
task: implement
skill: coder
context_budget: medium
automation_required: true
privacy: local_preferred
estimated_tokens: 14500
```

(`skill` names a model competency — coder, planner, reviewer, summariser — and is distinct from *capabilities*, which are tool permissions enforced by the sandbox.)

Outputs:

```yaml
selected_model: local:qwen3-coder
reason: "Fits safe_prompt_budget and preferred for coding"
fallbacks:
  - openrouter:free-code
  - manual:claude
```

Routing order should usually be:

```text
local automated
↓
free automated gateway
↓
manual subscription escalation
```

Manual subscription models are not called automatically. The runtime creates a prompt pack and waits for the user to paste the result back into the cockpit.

---

### 5.12 HITL Manager

The HITL Manager handles agent questions and human answers.

Responsibilities:

- create structured `agentspec:question` comments
- add issue labels such as `state:needs-human`
- notify cockpit Inbox
- pause run
- detect `agentspec:answer` comments
- validate answer format
- resume run
- record answer in run context
- optionally propose GameSpec updates

Question format:

```markdown
<!-- agentspec:question
id: q-42-001
run_id: run-2026-07-01-004
workflow: feature-prd
step_id: grill
-->

Question text...

Options:
A. ...
B. ...
C. ...
D. Custom
```

Answer format:

```markdown
<!-- agentspec:answer
question: q-42-001
-->

A
```

The runtime should treat a human answer as durable context.

The HITL Manager handles both HITL kinds defined in AgentSpec: `question` steps (pause until every open question is answered) and `approval` steps (pause after the step until the human approves or rejects its output).

Answer validation rules:

- Question ids follow `q-<issue-number>-<sequence>` (see AgentSpec, HITL Integration).
- An answer is only accepted from the repository owner or accounts explicitly listed in local config. `agentspec:answer` blocks from any other account are ignored and flagged in the Inbox.
- The first non-empty line must begin with one of the offered option letters or `custom:`. Malformed answers are ignored; the cockpit shows a validation error and the question stays open.
- If multiple valid answers exist for one question, the latest one posted **before the run resumes** wins. Once the run has resumed, later answers have no effect; changing a decision requires a new question or a design-decision workflow.

---

### 5.13 Audit Logger

The Audit Logger records what happened.

Audit events include:

- run created
- step started
- model selected
- context assembled
- prompt budget check passed/failed
- command executed
- file changed
- commit created
- PR opened
- question asked
- answer received
- run blocked
- run completed
- run failed

Local logs may contain full prompts and responses. GitHub should contain concise summaries.

Recommended split:

```text
GitHub:
  summaries
  questions
  answers
  PRs
  durable decisions

Local logs:
  full prompts
  full model responses
  command stdout/stderr
  intermediate scratch files
```

The user may explicitly export full transcripts to GitHub when useful.

---

### 5.14 Repository Indexer

The Repository Indexer maintains generated context files.

Outputs may include:

```text
.agent/context/repo-map.md
.agent/context/architecture-summary.md
.agent/context/current-features.md
.agent/context/dependency-map.md
.agent/context/api-map.md
.agent/context/ui-map.md
.agent/context/testing-summary.md
.agent/context/recent-decisions.md
.agent/context/known-problems.md
```

Each file must include freshness metadata:

```markdown
<!-- agentspec:generated-context
generator: repo-map-v1
commit: 3d92e11
generated_at: 2026-07-01T17:41:00+01:00
freshness: current
-->
```

When HEAD changes, the runtime marks affected context as stale. The cockpit may offer regeneration.

Generated context is never canonical. It is an acceleration layer for agents.

---

### 5.15 GameSpec Adapter

The GameSpec Adapter reads and writes structured game design.

It must support:

- loading GameSpec YAML
- extracting relevant sections for context assembly
- listing open questions
- linking mechanics to issues and PRDs
- proposing updates
- committing approved GameSpec changes
- rendering Wiki pages if configured

GameSpec changes require explicit approval unless the workflow is purely mechanical, such as formatting or link repair.

---

## 6. Runtime API

The exact transport is implementation-specific, but the runtime should expose these operations to the cockpit.

### 6.1 Repository Operations

```text
list_repositories
register_repository
sync_repository
get_repository_health
get_context_status
regenerate_context
```

### 6.2 Mission Operations

```text
list_missions
get_mission
create_mission
archive_mission
start_workflow
```

### 6.3 Run Operations

```text
list_runs
get_run
start_run
pause_run
resume_run
cancel_run
retry_step
override_model
override_context_profile
```

### 6.4 HITL Operations

```text
list_questions
get_question
answer_question
defer_question
```

### 6.5 Model Operations

```text
list_models
get_model_status
test_model
estimate_prompt
build_escalation_pack
submit_manual_model_response
```

### 6.6 GitHub Operations

```text
list_linked_issues
list_linked_prs
open_issue
open_pr
post_comment
apply_label
refresh_ci_status
```

---

## 7. Runtime State

Local runtime state is useful but non-canonical.

Suggested local layout:

```text
~/.agentspec/
  config.yaml
  cache/
    github/
    context/
  logs/
    runs/
  locks/
  worktrees/
```

### 7.1 Config

Local config contains secrets and machine-specific paths.

```yaml
repositories:
  project-phoenix-v2:
    path: D:/Projects/project-phoenix-v2
    github: jkeywo/project-phoenix-v2

providers:
  ollama:
    url: http://localhost:11434

  openrouter:
    enabled: true
    token_env: OPENROUTER_API_KEY

preferences:
  default_coding_model: local:qwen3-coder
  default_planning_model: local:deepseek
```

Do not commit this file.

### 7.2 Locks

Locks prevent conflicting local operations.

Examples:

```text
issue-42.lock
branch-agent-42-radar.lock
worktree-run-2026-07-01-004.lock
```

Locks are local execution safeguards. They are not canonical project state.

### 7.3 Logs

Full logs are local by default.

They may contain:

- prompts
- model responses
- full stdout/stderr
- stack traces
- temporary diffs

The runtime may summarise logs into GitHub comments.

---

## 8. Execution Flow Examples

### 8.1 Feature Request to PRD

1. User creates or selects feature issue.
2. Cockpit starts `feature-prd` workflow.
3. Runtime creates run.
4. PRD interviewer assembles context from issue and GameSpec.
5. Prompt Budgeter checks selected model.
6. Agent asks clarifying question.
7. HITL Manager writes GitHub question and pauses run.
8. User answers in cockpit.
9. Runtime resumes.
10. PRD writer creates `docs/prds/NNN-title.md`.
11. Runtime commits PRD or opens documentation PR, depending on configuration.
12. GitHub run summary is posted.

### 8.2 PRD to Issues

1. Runtime reads accepted PRD.
2. Issue decomposer assembles context.
3. Prompt Budgeter checks local model can fit PRD and relevant GameSpec.
4. Agent proposes child issues.
5. Runtime creates child GitHub issues.
6. Parent issue receives summary comment and links.
7. Mission Board updates progress.

### 8.3 Implementation Issue to PR

1. Runtime creates agent branch and worktree.
2. TDD developer reads issue, PRD, relevant files and GameSpec excerpt.
3. Prompt Budgeter determines whether focused context fits the local coding model.
4. Agent writes failing test where practical.
5. Runtime runs existing test regime.
6. Agent implements fix.
7. Runtime runs `cargo fmt`, `cargo test`, and configured checks.
8. Runtime commits changes.
9. Runtime opens PR.
10. PR enters human review state.

### 8.4 Context Overflow

1. Task requires 35k estimated tokens.
2. Selected local model has 24k safe prompt budget.
3. Runtime blocks before model invocation.
4. Cockpit Inbox shows context overflow.
5. User selects “split task”.
6. Runtime creates smaller child tasks.
7. Workflow resumes with focused context.

---

## 9. Error Handling

### 9.1 Model Unavailable

If selected model is unavailable:

1. try configured fallback
2. if no automated fallback, create manual escalation pack
3. if escalation unavailable, block run

### 9.2 Unparseable Model Output

If output cannot be parsed:

1. retry with stricter schema prompt
2. retry with a stronger model if available
3. ask human to interpret or approve
4. fail run after retry limit

### 9.3 Command Failure

If command exits non-zero:

- test failures may trigger `apply_fixes`
- missing tool failures block and ask for setup
- permission failures fail immediately
- timeout failures block with logs

### 9.4 GitHub Conflict

If GitHub state changed while the run was active:

1. refresh issue/PR state
2. rebase context
3. ask human if conflict is semantic
4. retry safe update
5. block if unclear

### 9.5 Worktree Dirty State

If a worktree is unexpectedly dirty:

1. stop execution
2. record diff
3. ask user whether to keep, discard, or inspect
4. never silently delete changes

---

## 10. Security Model

The runtime should assume local execution can be risky.

Minimum security rules:

- no secret files are included in prompts
- no `.env` or credential files are read unless explicitly allowed
- no shell command runs without declared capability
- no destructive git commands without explicit human approval
- no network calls except approved providers and GitHub by default
- no automatic merge to protected branches
- no force push
- no editing GitHub secrets
- no deleting workflows
- no execution of arbitrary model-suggested shell commands without validation

Command allowlists should be preferred over broad shell access.

### 10.1 Hard enforcement at GitHub

The capability sandbox is local software; a bug or a successful prompt injection bypasses everything it forbids. The prohibitions in the Engineering Vision (§3.7) must therefore also be enforced server-side:

- **Branch protection on `main`** is required: no direct pushes, no force pushes, PRs required. This makes "agents may not push to main" a property of the repository, not a promise of the runtime.
- **Use a fine-grained personal access token** scoped to only the repositories and permissions the runtime needs (contents, issues, pull requests). Do not give the runtime a classic full-scope token. The token must not have permission to modify repository settings, secrets, or workflows.

### 10.2 Untrusted content and prompt injection

Everything agents read from GitHub — issue bodies, comments, PR descriptions — is *content*, not instructions. Anyone who can comment on an issue can attempt to inject instructions into an agent's context.

Minimum rules:

- Prompts must clearly delimit quoted GitHub content from system instructions.
- `agentspec:answer` blocks are only honoured from the repository owner or explicitly configured accounts (§5.12).
- Agent-proposed actions derived from issue content still pass through the capability sandbox; content can never widen a run's capabilities.
- On public repositories, treat comments from non-collaborators with particular suspicion; the runtime may be configured to ignore them entirely during context assembly.

---

## 11. Review Against Engineering Vision

This RuntimeSpec conforms to the Engineering Vision as follows:

- **GitHub is canonical.** Durable state is written to GitHub; local runtime state is transient.
- **Local personal cockpit.** Runtime runs locally and serves the cockpit.
- **Agents act as the user.** GitHub actions use the user’s identity but include AgentSpec metadata.
- **HITL is durable.** Questions and answers are GitHub comments.
- **Subscription models are manual escalation.** Runtime prepares prompt packs rather than automating unsupported subscription UIs.
- **Worktree isolation.** All code-writing runs use isolated worktrees.
- **No automatic merges.** Agents open PRs and recommend review.
- **Existing tests first.** Runtime runs the repository’s configured test regime.
- **Context freshness.** Repository Indexer manages generated context with freshness metadata.
- **Context-budget awareness.** Prompt Budgeter and Model Router enforce safe context windows.
- **GameSpec is canonical.** GameSpec Adapter reads canonical design and writes changes only when approved.

No deliberate deviations from the Engineering Vision are introduced.

---

## 12. Minimal v1 Runtime

The first useful runtime should implement only:

1. repository registration
2. GitHub authentication through user account or `gh`
3. issue reading and comment writing
4. AgentSpec loading
5. manual workflow start
6. PRD grilling workflow
7. HITL question/answer loop
8. context assembly from issue + GameSpec
9. basic local model routing
10. manual subscription escalation pack
11. writing PRD markdown
12. run summaries in GitHub

Autonomous code editing can wait until the PRD and issue workflows are stable.

---

## 13. Future Work

Future runtime capabilities may include:

- full coding workflow
- Playwright/browser automation
- richer context retrieval
- whole-repo map-reduce summarisation
- persistent metrics database
- multi-repo missions
- provider health scoring
- automated model benchmarking
- background GitHub webhook listener
- release workflow automation
- playtest feedback ingestion
- automatic Wiki rendering from GameSpec

---

## 14. Next Document

This completes the first-pass specification suite after:

- `00-EngineeringVision.md`
- `01-AgentSpec.md`
- `02-GameSpec.md`
- `03-CockpitSpec.md`
- `04-RuntimeSpec.md`

The next useful artefact would be an implementation plan or a repository bootstrap package containing:

```text
projectspec.yaml
.agent/
  workflows/
  prompts/
  labels.yaml
  models.yaml
.gamespec/
  phoenix.gamespec.yaml
docs/
  prds/
  adrs/
```
