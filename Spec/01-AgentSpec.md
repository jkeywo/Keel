# AgentSpec Specification

## Purpose

AgentSpec defines the declarative language and data model for describing how long‑running engineering missions are broken down into workflows, runs and tasks, how these pieces are orchestrated by the agentic runtime, and how they interact with GitHub, GameSpec and other repository artefacts.  It exists to separate the description of *what* work needs to be done from *how* that work is implemented by individual agents and language models.  By capturing workflows explicitly in a portable format, AgentSpec makes it possible to automate complex software development processes in a reproducible, auditable and extensible way.

AgentSpec is not concerned with the details of game mechanics (that is the responsibility of GameSpec) nor with the visual presentation of work (the CockpitSpec).  It also does not define the runtime implementation itself (covered by the RuntimeSpec).  Instead, AgentSpec acts as the contract between missions defined by designers and managers and the agentic runtime that will execute those missions using a fleet of LLM‑powered agents.

## Scope

This document covers the following aspects of AgentSpec:

* **Terminology.** A glossary of the core entities used throughout the specification.
* **Design goals.** The guiding principles that inform the specification.
* **Formal specification.** The DSL grammar and semantics for missions, workflows, runs, tasks and steps; agents; capabilities; model routing; human‑in‑the‑loop (HITL) integration; and state machines.
* **Execution semantics.** How the runtime interprets AgentSpec, including lifecycle, concurrency and error handling.
* **GitHub integration.** Mapping between AgentSpec concepts and GitHub issues, pull requests, labels and comments.
* **Examples.** Sample YAML documents illustrating typical use cases.
* **Validation rules.** Constraints on well‑formed AgentSpec documents.
* **Extension points.** Areas where new capabilities, tasks or integrations can be added without breaking existing specs.

The specification intentionally avoids prescribing a specific UI or command‑line interface; those concerns are addressed in CockpitSpec.  It also does not define game‑specific design content; that is handled by GameSpec.

## Design Goals

The AgentSpec language is designed according to these principles:

1. **Declarative.** Workflows describe desired outcomes and sequences of activities without encoding the imperative logic of how to achieve them.
2. **Stateless agents.** Agents are stateless executors; they reconstruct context from issues, GameSpec, the Repository Index and linked PRDs rather than relying on hidden memory.  This aligns with the engineering vision that the canonical state lives in GitHub.
3. **Mission hierarchy.** Work is organised into missions, workflows, runs and tasks.  Missions capture long‑lived objectives; workflows define reusable processes; runs are concrete instances of workflows; tasks describe individual executable units.
4. **Explicit capabilities.** Each task declares which capabilities it requires.  Workflows may only reference capabilities that have been granted by the mission.  This enables fine‑grained control over what the runtime may do, preventing dangerous actions such as force‑pushing or merging code without review.
5. **Human‑in‑the‑loop.** Ambiguities trigger questions which are recorded in GitHub comments and surfaced in the cockpit.  AgentSpec treats human input as a first‑class dependency rather than a failure case.
6. **Model agnostic.** Workflows define what needs to happen; the runtime selects appropriate models based on capabilities and routing rules.  This ensures portability across different LLM providers and local models.
7. **GitHub as database.** All durable state – features, bugs, PRDs, agent summaries, workflow progress – is persisted in GitHub issues, pull requests, labels and committed files.  Local storage is used only for secrets, caches and transient logs.
8. **Extensible.** New task types, capabilities and agents can be introduced without breaking existing specifications.  The language is versioned to allow future evolution.

## Terminology

* **Mission.** A long‑lived engineering objective that organises one or more workflows.  Examples include “Implement Fleet Sensors”, “Rewrite Asset Pipeline” or “Prepare Steam Release”.  Missions correspond to high‑level goals visible on the cockpit’s Mission Board.
* **Workflow.** A declarative description of a reusable process that achieves a particular outcome.  Workflows can be bound to missions and executed multiple times (runs).  Examples include Feature Development, Bug Fix, Research and Release.
* **Run.** A specific instance of a workflow executed against a particular input (such as a feature request or bug report).  Runs have a unique identifier, maintain transient execution state and produce artefacts such as branches and pull requests.
* **Task.** An atomic unit of work within a run.  Tasks map to capabilities and actions such as “grill user”, “write PRD”, “decompose into issues”, “write test”, “implement code”, “run formatter” or “open pull request”.  Tasks may be composed of smaller **steps**.
* **Step.** The smallest executable instruction within a task, representing a single action such as sending a message to an LLM, running a command in a worktree, or writing a comment on GitHub.  Steps are internal to the runtime and do not appear in the AgentSpec file; they are derived from tasks by the runtime.
* **Agent.** A stateless executor responsible for carrying out tasks.  Agents are typed by their purpose (e.g. `prd-interviewer`, `tdd-developer`, `reviewer`) and have associated capabilities.  Agents act under the user’s GitHub identity but must include structured metadata in comments, commits and pull requests.
* **Capability.** A named permission that controls what actions an agent may perform.  Core capabilities include `read`, `edit`, `git`, `build`, `browser`, `asset` and `dangerous` (the latter is disallowed by default).  Missions grant capabilities to workflows; workflows grant subsets of capabilities to tasks.
* **Model router.** The component of the runtime that selects an appropriate language model for a given agent request based on capability requirements, context length and provider availability.
* **HITL (Human‑in‑the‑Loop).** A mechanism by which agents ask clarifying questions when ambiguous input is detected.  Questions and answers are recorded in GitHub comments and surfaced in the cockpit.

## Formal Specification

### Document Format

AgentSpec files are YAML documents with the top‑level key `missions`.  Each mission entry describes the mission and lists the workflows it includes.  Workflows may either be defined inline under `workflows` or referenced from reusable workflow definitions stored elsewhere (e.g. in `.agent/workflows/`).

The high‑level grammar (expressed informally) is as follows:

```
AgentSpec := { spec_version: String, missions: [ Mission ] }
Mission  := { id: String, title: String, description?: String,
              workflows: [ MissionWorkflow ],
              permissions?: [ Capability ],
              design_links?: [ String ] }
MissionWorkflow := { id: String, workflow: String |
                      inline_workflow: Workflow,
                      triggers?: [ Trigger ],
                      inputs?: { ... } }
Trigger := { type: "manual" | "github_label" | "github_comment" |
                   "scheduled" | "post_merge",
             ...type-specific fields (see Triggers)... }
Workflow := { id: String, title: String, description?: String,
              steps: [ WorkflowStep ],
              capabilities: [ Capability ],
              version?: String }
WorkflowStep := { id: String, task: String, description?: String,
                  agent: String, prompt?: String,
                  context?: ContextProfile,
                  outputs?: [ Output ],
                  hitl?: "question" | "approval" }
ContextProfile := { budget?: "small" | "medium" | "large",
                    strategy?: "focused" | "broad",
                    required_sources?: [ String ],
                    max_files?: Integer,
                    max_tokens?: Integer }
```

Additional fields may be included for future expansion.  `spec_version` is required once at the document level to allow backwards compatibility.

### Missions

A mission entry declares a long‑lived objective.  Missions must specify:

* `id` – a machine‑readable identifier (e.g. `fleet-sensors`).
* `title` – a human‑friendly title for display in the cockpit.
* `description` – optional free‑form text describing the goal and any context not captured in GameSpec.
* `workflows` – a list of mission workflows.  Each entry either references a reusable workflow by `workflow: <name>` or defines one inline under `inline_workflow`.  Entries may declare `triggers` that start runs automatically (see Triggers) and `inputs` passed to the workflow.
* `permissions` – optional list of capabilities granted to the mission.  If omitted, the mission inherits a default safe set (`read`, `edit`, `git`, `build`).
* `design_links` – optional array of links into GameSpec or the GitHub Wiki that contextualise the mission (e.g. a specific mechanic file).

`spec_version` is declared once at the top of the document (e.g. `1.0.0`), not per mission.  Tools may reject or warn about unsupported versions.

Missions persist across multiple runs and workflow executions; they are visible on the cockpit’s Mission Board.  When a mission is marked complete, all linked issues and PRs are closed (subject to human approval) and the mission may be archived.

### Triggers

Each mission workflow may declare `triggers` that tell the runtime when to create a run.  Supported trigger types:

* `manual` – the user starts the workflow from the cockpit.  This is the only trigger type required for v1.
* `github_label` – a run starts when the named label is applied to an issue.  Field: `label` (e.g. `type:feature`).
* `github_comment` – a run starts when an issue comment matches a command pattern.  Field: `command` (e.g. `/agent start feature-prd`).
* `scheduled` – a run starts on a cron schedule.  Field: `cron` (e.g. `"0 9 * * *"`).
* `post_merge` – a run starts when a pull request merges into the named branch.  Field: `branch` (e.g. `main`).

Example:

```yaml
triggers:
  - type: github_label
    label: type:feature
```

If no triggers are declared, the workflow can only be started manually.  The runtime must prevent duplicate concurrent runs for the same issue and workflow unless explicitly requested (see RuntimeSpec §5.1).

### Workflows

Workflows define reusable sequences of steps to achieve a concrete outcome, such as implementing a feature or fixing a bug.  A workflow definition must include:

* `id` – unique within the repository (e.g. `feature-prd`).
* `title` – human‑friendly name.
* `description` – optional narrative describing the purpose and expected outcome.
* `capabilities` – list of capabilities that any run of this workflow may request.  This must be a subset of the mission’s `permissions`.
* `steps` – ordered list of `WorkflowStep` entries.  Steps are executed sequentially unless the runtime determines that some may run concurrently (e.g. independent tasks).
* `version` – optional version string for compatibility.

Workflow definitions may be stored globally (e.g. `.agent/workflows/feature-prd.yaml`) and reused across missions by referencing their `id`.  Inline workflows allow mission‑specific customisation without polluting the global library.

### Workflow Steps and Tasks

Each `WorkflowStep` specifies a task to be executed within a run.  A step includes:

* `id` – unique within its workflow.
* `task` – the name of the task type.  The runtime maps this to a library of task templates.  Supported tasks include (but are not limited to):
  - `grill` – ask clarifying questions about the feature request or bug report.
  - `write_prd` – draft a product requirements document using templates.
  - `decompose` – break a PRD into smaller issues and tests.
  - `write_test` – create a failing test for the next feature or bug.
  - `implement` – write code to satisfy tests and PRD.
  - `run_ci` – execute existing CI pipelines.
  - `open_pr` – open a pull request for human review.
  - `review` – perform an automated code review (static analysis, style checks, etc.).
  - `apply_fixes` – iterate on failed CI results or code review feedback.
* `description` – optional textual explanation for human readers.
* `agent` – the type of agent responsible (e.g. `prd-interviewer`, `tdd-developer`, `reviewer`).  The runtime uses this to choose capabilities and model routes.
* `prompt` – optional prompt id from the Prompt Library (see `07-PromptLibrarySpec.md`).  Each task template declares a default prompt; a step may override that default here.
* `context` – optional context profile controlling how the runtime assembles model input for this step (see Context Profiles).
* `outputs` – optional list of named outputs (e.g. `prd_file`, `issues`, `pull_request_url`) that subsequent steps can consume.
* `hitl` – optional human-in-the-loop marker.  Two kinds exist and they behave differently:
  - `question` – the step asks one or more structured questions (written as `agentspec:question` comments).  The run enters `waiting_for_human` until every open question has a valid answer, then the step continues.  A grilling step may ask several rounds of questions before it completes.
  - `approval` – execution halts *after* the step completes and the run enters `waiting_for_human` until the human approves or rejects the step's output in the cockpit.  Approval resumes the run; rejection blocks it with the human's feedback attached.

Task definitions themselves are not embedded in AgentSpec.  They are part of the runtime’s library and may be updated without changing mission definitions.  Each task template declares its required capabilities, default agent type, default prompt id, and whether it supports HITL.

### Context Profiles

A context profile tells the runtime how to assemble model input for a step.  Fields:

* `budget` – `small`, `medium` or `large`.  A rough size class; the runtime maps each class to concrete token counts per model in `models.yaml`.
* `strategy` – `focused` (only explicitly linked artefacts and directly relevant files) or `broad` (may also include repo maps, summaries and adjacent files).
* `required_sources` – named sources that must be present in the prompt, e.g. `issue`, `comments`, `answers`, `prd`, `gamespec_excerpt`, `relevant_files`, `ci_logs`.  If a required source cannot fit within budget, the run blocks with a context-overflow item rather than silently dropping the source.
* `max_files` – hard cap on the number of source files included.
* `max_tokens` – hard cap on estimated prompt size, regardless of the selected model's budget.

Example:

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

If a step declares no profile, the task template's default profile applies.  The step's profile takes precedence over any `assumptions` declared in prompt frontmatter (see `07-PromptLibrarySpec.md`); the Prompt Budgeter (RuntimeSpec §5.10) makes the final fit decision.

### Sequencing and Fan-Out

Workflow steps execute sequentially.  AgentSpec v1 deliberately has **no iteration or fan-out construct**.  A workflow that produces multiple work items — for example `decompose`, which creates child issues — *ends* after creating them.  Each child issue then starts its own run of another workflow through that workflow's triggers (typically a `github_label` trigger on `state:ready-for-work`).  This keeps every run small, restartable, and traceable to exactly one GitHub object.  A `for_each` construct may be added in a future version (see Extension Points).

### Agents

Agents are stateless executors identified by type (e.g. `prd-interviewer`, `tdd-developer`, `reviewer`, `ci-fixer`).  Agent types map to prompt templates, context assembly rules and model preferences in the runtime.  AgentSpec does not define agent prompts directly; instead it references agents by name, allowing the runtime to evolve prompts without altering the spec.

Each agent type declares the capabilities it can utilise.  For example:

```
agents:
  prd-interviewer:
    capabilities: [read, git]
    model_preferences: [claude-subscription, gpt-subscription, qwen-coder-local]
  tdd-developer:
    capabilities: [read, edit, git, build]
    model_preferences: [qwen-coder-local, deepseek-coder-local, claude-subscription]
  reviewer:
    capabilities: [read, git]
    model_preferences: [claude-subscription, gemini-subscription]
```

These preferences are advisory; the model router ultimately selects a model based on availability, rate limits and cost considerations.  Agents do not maintain memory; they receive the current context (issue, PRD, GameSpec excerpt, repo index) from the runtime at each invocation.

### Capabilities

Capabilities are strings representing permissions.  The built‑in capability groups are:

* **read** – read files in the repository; read Git history, issues, PRs, comments; read build logs.
* **edit** – modify files, create new files, delete files, run formatters and organise imports.
* **git** – create branches, commit changes, push branches, create issues, create pull requests, update pull request descriptions, add or remove labels and comments.  Does *not* include merging to `main` or other restricted actions.
* **build** – run the standard build and test commands defined by the ProjectSpec (e.g. `cargo test`, `cargo clippy`, `wasm build`).
* **browser** – launch a headless browser to perform UI automation, capture screenshots or run end‑to‑end tests.
* **asset** – run asset pipeline tools such as GLTF conversion or texture optimisation.
* **dangerous** – force‑push, rewrite history, delete branches, modify secrets or any other action deemed destructive.  Missions never grant this capability without explicit approval.

Missions may grant additional custom capabilities (e.g. `database` or `cloud-deploy`) as the runtime evolves.  Workflows must not request capabilities that the mission does not grant.

### Model Routing

AgentSpec does not bind a task to a specific language model.  Instead, the runtime uses a model router to select an appropriate provider at execution time.  The router considers the agent type, the task’s capabilities, the context length, and the current availability of local models and subscription models.  Providers may include local models via Ollama (e.g. Qwen3‑Coder, DeepSeek, GLM), free models via OpenRouter, and subscription models via ChatGPT or Claude.  Manual escalation to subscription models occurs via the cockpit when human assistance is required.

### HITL Integration

A step with `hitl: question` writes one or more clarifying questions as GitHub comments and pauses the run until each has a valid answer; a step with `hitl: approval` pauses after the step completes until the human approves or rejects its output in the cockpit (see Workflow Steps and Tasks).  A question uses a structured block:

```
<!-- agentspec:question
id: q-42-001
workflow: feature-prd
run_id: run-2026-07-01-004
step_id: grill-contacts
-->

Should radar contacts be visible before sensor lock?

Options:
A. Always visible as fuzzy blips
B. Hidden until scanned
C. Visible only within sensor range
D. Custom answer
```

The cockpit renders this as a form.  When the human responds, their answer is written back as a comment:

```
<!-- agentspec:answer
question: q-42-001
-->

A
```

The runtime monitors issue comments for `agentspec:answer` blocks keyed by `question`.  Once an answer is detected, the run resumes.  The answer becomes part of the mission’s durable state and is used to update GameSpec if necessary.

Question ids follow the scheme `q-<issue-number>-<sequence>`, where `<sequence>` is per-issue and zero-padded to three digits (e.g. `q-42-001`, `q-42-002`).  The first non-empty line of an answer body must begin with the chosen option letter, or with `custom:` followed by a free-form answer.  Any text after the first line is treated as elaboration and included in run context.  Answer validation and authorisation rules (who may answer, malformed answers, duplicates) are defined in RuntimeSpec §5.12.

### State Machine

Each run transitions through a lifecycle defined by a finite state machine.  The high‑level states are:

| State              | Description |
|--------------------|-------------|
| `pending`          | Run is created but not yet started. |
| `running`          | Current step is being executed by an agent. |
| `waiting_for_human`| A HITL question has been asked and execution is paused. |
| `blocked`          | Execution cannot continue due to external factors (e.g. CI failure outside of agent control). |
| `failed`           | The run encountered an unrecoverable error. |
| `cancelled`        | The run was cancelled by the user before completion. |
| `completed`        | All steps finished successfully. |

Steps themselves may have sub‑states (e.g. `planning`, `executing`, `verifying`), but these are runtime details and not exposed in AgentSpec.  The runtime writes a summary comment on the relevant issue or pull request at the end of each step, including the new state and any artefacts produced.

## Execution Semantics

### Mission Lifecycle

Missions are created by committing an AgentSpec file into the repository (e.g. `.agent/workflows/mission-fleet-sensors.yaml`) and linking it to a user story or feature request in GitHub.  Upon activation, the runtime loads the mission’s workflows and waits for triggers.  A trigger can be manual (a user clicks “Start Workflow” in the cockpit), based on labels (e.g. adding `type:feature` to an issue), or scheduled (e.g. weekly research tasks).

When a mission’s last workflow completes and all linked tasks are closed, the mission enters a `done` state.  The cockpit can archive the mission, hiding it from the mission board.  Missions may be reopened if further work is required.

### Workflow and Run Lifecycle

When a trigger fires, the runtime creates a run.  It assigns a unique run identifier (e.g. `run-2026-07-01-004`) and records the run’s initial state (`pending`) in a structured metadata comment on the associated issue (an HTML-comment block — invisible when the comment is rendered, but present in the raw Markdown).  The runtime then executes steps in order, subject to capability constraints:

1. **Context assembly.** The runtime gathers context from the relevant issue or PR, PRDs, GameSpec, the Repository Index and any linked artefacts.  It applies prompt templates associated with the agent type and task to build the LLM prompt.
2. **Agent invocation.** The model router selects a model and executes the agent.  Output is captured as plain text, structured JSON or code diff depending on the task.
3. **Action execution.** If the agent proposes file modifications, the runtime applies them in an isolated git worktree.  If it proposes commands, the runtime executes them subject to the `build` capability.
4. **Verification.** After each step, the runtime may run tests (`build` capability) or lints.  If verification fails, the run may enter `blocked` or `waiting_for_human` depending on whether the failure is fixable by the agent.
5. **State update.** The runtime writes a summary to GitHub, including structured metadata about the run, step and agent.  If a HITL question was asked, the run’s state becomes `waiting_for_human`.
6. **Completion.** When the last step finishes and no further HITL inputs are required, the run transitions to `completed`.  The mission may then trigger its next workflow or mark itself as done.

Multiple runs may be active concurrently under the same mission if workflows are independent.  The runtime enforces worktree isolation to avoid conflicts.

### Concurrency and Isolation

* Each run operates in its own git worktree created via `git worktree add`.  No run modifies the user’s working tree or another run’s worktree.  Branch names follow the pattern `agent/<issue-number>-<short-title>`.
* The runtime serialises writes to GitHub to avoid race conditions.  If two runs attempt to modify the same issue labels or comments, one will retry after a backoff.
* Agents have time and token budgets per step.  Long‑running operations are aborted and the run enters `blocked` with an explanatory comment.

### Error Handling

If an agent encounters an error (e.g. network failure, model unavailability, unparseable output), the runtime retries with exponential backoff up to a configurable number of attempts.  If retries are exhausted, the run enters `failed` and notifies the user in the cockpit.  Humans may choose to resume the run manually after addressing the issue.

If verification fails (e.g. tests do not pass), the runtime may retry using a fallback model or execute a corrective task (e.g. `apply_fixes`).  If the failure cannot be resolved automatically, the run enters `blocked` and awaits human intervention.

## GitHub Integration

AgentSpec assumes GitHub is the canonical store for durable state.  The following mappings apply:

* **Issues.** Each feature request, bug report or research task corresponds to a GitHub issue.  Mission and workflow identifiers may be recorded in structured metadata blocks inside issue comments.  Labels indicate type (`type:feature`, `type:bug`) and state (`state:needs-grilling`, `state:prd-draft`, etc.).  The canonical label set is defined in `06-RepositorySpec.md`.
* **Pull requests.** Implementation work is delivered via PRs on agent branches.  PR descriptions must include a structured block recording the run identifier, workflow, agent and verification status.  PRs are marked as ready for human review when CI passes and the workflow reaches its final step.
* **Labels.** Workflows and tasks map to labels.  For example, when a run is in the “grill” step, the issue might carry `state:needs-grilling`.  When a PRD is drafted, the issue receives `state:prd-draft`.  These labels drive triggers and aid cockpit filtering.
* **Comments.** Agents write clarifying questions, answers, run summaries and step results in comments.  Structured metadata blocks (e.g. `agentspec:question`, `agentspec:answer`, `agentspec:run`, `agentspec:pr`) enable the runtime to parse and update state.
* **Commits.** Commits made by agents include a footer with the run identifier, step and agent type.  This ensures traceability when reviewing history.  Agents never commit directly to `main`; they work on agent branches and open PRs for review.

## Examples

### Mission Definition

```yaml
spec_version: 1.0.0
missions:
  - id: fleet-sensors
    title: Implement Fleet Sensors
    description: |
      Provide cooperative starship crews with a sensor system that can detect nearby ships and celestial objects, integrating with the existing bridge UI.
    permissions: [read, edit, git, build]
    design_links:
      - wikilink:GameSpec/Systems/Sensors.md
    workflows:
      - id: sensor-prd
        workflow: feature-prd
        triggers:
          - type: github_label
            label: type:feature
      - id: sensor-implementation
        workflow: issue-implementation
        triggers:
          - type: github_label
            label: state:ready-for-work
        inputs:
          output_branch_prefix: agent
      - id: sensor-bug-fix
        workflow: bug-fix
        triggers:
          - type: github_label
            label: type:bug
        inputs:
          output_branch_prefix: agent
```

### Workflow Definitions (Feature PRD and Issue Implementation)

Feature development is deliberately split into two workflows.  The first turns a feature request into an accepted PRD and child issues; each child issue then triggers its own run of the second (see Sequencing and Fan-Out).

```yaml
id: feature-prd
title: Feature PRD Workflow
description: |
  Turn a feature request issue into an accepted PRD and small implementation issues.
capabilities: [read, edit, git]
steps:
  - id: grill
    task: grill
    description: Ask clarifying questions about the feature request.
    agent: prd-interviewer
    outputs: [answers]
    hitl: question
  - id: prd
    task: write_prd
    description: Draft a product requirements document based on the issue and answers.
    agent: prd-writer
    outputs: [prd_file]
    hitl: approval
  - id: decompose
    task: decompose
    description: Break the accepted PRD into small implementation issues labelled state:ready-for-work.
    agent: issue-decomposer
    outputs: [child_issues]
```

```yaml
id: issue-implementation
title: Issue Implementation Workflow
description: |
  Implement a single small issue in an isolated worktree and open a PR for human review.
capabilities: [read, edit, git, build]
steps:
  - id: test
    task: write_test
    description: Write a failing test capturing the issue's acceptance criteria.
    agent: tdd-developer
    outputs: [test_files]
  - id: code
    task: implement
    description: Write code to make the failing test pass.
    agent: tdd-developer
    outputs: [branch]
  - id: ci
    task: run_ci
    description: Run existing tests and lints; ensure the code builds.
    agent: ci-runner
    outputs: [ci_status]
  - id: pr
    task: open_pr
    description: Open a pull request for human review.
    agent: pr-opener
    outputs: [pull_request_url]
  - id: review
    task: review
    description: Perform static analysis and automated code review, then hand off to the human.
    agent: reviewer
    outputs: [review_notes]
    hitl: approval
```

There is no merge step: agents may not merge.  The workflow's terminal state is a PR awaiting human review; merging is a human action performed in the cockpit or directly on GitHub.

### Clarifying Question and Answer

```markdown
<!-- agentspec:question
id: q-42-002
workflow: feature-prd
run_id: run-2026-07-15-002
step_id: grill
-->

Should unknown radar contacts be visible before the sensors lock onto them?

Options:
A. Always visible as fuzzy blips
B. Hidden until scanned
C. Visible only within sensor range
D. Custom answer
```

Human responds via cockpit:

```markdown
<!-- agentspec:answer
question: q-42-002
-->

A. Always visible as fuzzy blips
```

### Pull Request Structured Block

```markdown
<!-- agentspec:pr
run_id: run-2026-07-15-002
workflow: issue-implementation
step: pr
agent: pr-opener
verification:
  cargo_fmt: passed
  cargo_test: passed
  wasm_build: passed
requires_human_review: true
-->

This pull request implements the radar contact visibility feature based on the PRD.  All automated tests pass, and code formatting has been applied.  Please review the implementation and merge when satisfied.
```

## Validation Rules

* **Unique identifiers.** `id` fields for missions, workflows and steps must be unique within their scope.  Runs are automatically assigned unique identifiers by the runtime.
* **Allowed capabilities.** Missions may only include capabilities from the set defined by the runtime or declared as custom.  Workflows must not request capabilities not granted by the mission.
* **Required fields.** `spec_version` (once, at document level), `missions.id`, `missions.title`, `workflows.id` and `steps.id` are mandatory.  Missing required fields result in a validation error.
* **HITL values.** `hitl`, when present, must be `question` or `approval`.  Steps whose task template does not support HITL must not declare it.
* **YAML type safety.** All fields must be scalar strings, arrays or objects.  Anchors and aliases are discouraged to maintain portability.
* **Versioning.** `spec_version` must follow semantic versioning (`MAJOR.MINOR.PATCH`).  The runtime may reject documents with unsupported major versions.
* **Security.** Tasks marked as `dangerous` must not be present unless the mission explicitly grants the `dangerous` capability and the cockpit confirms the action.

## Extension Points

AgentSpec is designed to evolve.  Extensions may include:

* **Custom capabilities.** Projects may define domain‑specific capabilities (e.g. `database`, `cloud-deploy`).  These must be implemented in the runtime and declared in missions before use.
* **New task types.** The runtime’s task library can grow.  New tasks should be documented and may require runtime updates.  Existing workflows may reference new tasks in future versions.
* **Hooks.** Missions or workflows can define hooks that run custom scripts or call out to other services.  Hooks must declare which capabilities they require.
* **Conditional steps and iteration.** Future versions may introduce conditional execution (e.g. `if`, `switch`) and fan-out (`for_each`) so a single run can iterate over outputs such as child issues.  In v1, fan-out is modelled as separate runs triggered per issue (see Sequencing and Fan-Out).
* **Parallelism hints.** Steps may include metadata to indicate that certain tasks can run concurrently.

## Future Work

AgentSpec v1.0.0 focuses on capturing the essentials for Project Phoenix.  Future versions may address:

* **ProjectSpec integration.** A separate ProjectSpec may describe repository‑level configuration (languages, build commands, test commands, coding standards).  AgentSpec will link to ProjectSpec to infer build and test commands.
* **Richer context assembly.** Declarative rules for selecting which parts of GameSpec and the Repository Index to include in prompts.
* **Workflow composition.** Higher‑order workflows that combine multiple workflows sequentially or conditionally.
* **Agent performance metrics.** Recording latency, token usage and success rates to inform model routing and optimisation.
* **Multi‑repo missions.** Extending missions to coordinate work across multiple repositories.

---

This specification provides a comprehensive definition of AgentSpec and its role within the broader agentic engineering system.  It aligns with the engineering vision that GitHub is the source of truth, agents are stateless, missions organise work hierarchically, capabilities constrain actions, and human input is always part of the loop.  Adherence to these principles ensures that the runtime can interpret AgentSpec documents consistently and that the resulting workflows remain auditable, reproducible and portable across model providers and projects.