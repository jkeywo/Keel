# 00 — Engineering Vision

**Project:** Phoenix Agentic Engineering Suite  
**Document status:** Draft v0.1  
**Primary target repository:** `jkeywo/project-phoenix-v2`  
**Primary use case:** A local personal engineering cockpit for managing game development through GitHub, AgentSpec, GameSpec, and agentic workflows.  
**Last updated:** 2026-07-01

---

## 1. Purpose

This document defines the vision, architectural decisions, terminology, and boundaries for the **Phoenix Agentic Engineering Suite**.

The suite is intended to support development of `project-phoenix-v2`, a browser/native game project, by combining:

- GitHub as the canonical project database.
- A local web cockpit as the operator interface.
- AgentSpec as the workflow and orchestration language.
- GameSpec as the game-design capture language.
- A runtime that coordinates agents, models, tools, GitHub, CI, local execution, and human review.

This document is not an implementation plan. It is the controlling overview that keeps the later specifications aligned.

The later specifications are:

| Document | Purpose |
|---|---|
| `01-AgentSpec.md` | Defines missions, workflows, agents, capabilities, model routing, HITL, GitHub state, and workflow semantics. |
| `02-GameSpec.md` | Defines a structured DSL for capturing the game design, mechanics, systems, roles, loops, design decisions, and open questions. |
| `03-CockpitSpec.md` | Defines the local web GUI: Mission Board, Design Board, Inbox, agent run views, model monitor, and GitHub-linked interaction model. |
| `04-RuntimeSpec.md` | Defines the execution engine: scheduler, adapters, worktree manager, sandbox, provider routing, GitHub integration, and event loop. |
| `05-ProjectSpec.md` | Defines repository-level facts such as language, build commands, test commands, directory layout hints, and tooling. |
| `06-RepositorySpec.md` | Defines the repository layout, GitHub label and branch conventions, and required ancillary files. It is the canonical source for layout and labels. |
| `07-PromptLibrarySpec.md` | Defines how prompts are stored, structured, named and versioned under `.agent/prompts/`. |
| `08-ImplementationRoadmap.md` | Suggests a build sequence for the suite, cut around the milestones in this document. |

Where documents disagree on a detail, the precedence rules in `MANIFEST.md` apply.

---

## 2. Core Problem

Modern coding agents are powerful, but they are usually exposed as isolated chat or coding tools. That is not enough for a complex game project.

The problem is not merely:

> “Can an LLM write some code?”

The real problem is:

> “Can a local engineering system help move game-development work from vague idea to tested, reviewed, merged implementation, while preserving design intent and project history?”

For `project-phoenix-v2`, the missing pieces are:

1. A clear game-design source of truth.
2. A way to turn rough feature ideas into PRDs.
3. A way to decompose PRDs into small issues.
4. A way to run agentic TDD loops safely.
5. A way to triage and fix bugs.
6. A way to ask the human operator questions instead of guessing.
7. A way to track all of this in GitHub.
8. A local dashboard that shows project progress in terms of missions and design state rather than raw model calls.

The suite is designed to solve those problems without creating a separate proprietary project database.

---

## 3. Accepted Architectural Decisions

This section records the decisions accepted during the design conversation.

### 3.1 GitHub is the canonical engineering database

GitHub stores durable project state.

This includes:

- Features.
- Bugs.
- PRDs.
- Issues.
- Pull requests.
- Reviews.
- CI results.
- HITL questions.
- HITL answers.
- Agent run summaries.
- Workflow state.
- Documentation.
- ADRs.
- Design decisions, where appropriate.
- Branches and commits.

The cockpit may cache GitHub data locally, but losing the local cache must not lose project knowledge.

Rule:

> If losing the local cockpit folder would lose project knowledge, that data belongs in GitHub.

A fresh cockpit install should be able to:

1. Authenticate with GitHub.
2. Point at `jkeywo/project-phoenix-v2`.
3. Reconstruct the visible project state from GitHub issues, PRs, labels, comments, branches, docs, and wiki content.

---

### 3.2 Local state is minimal and disposable

The local machine may store:

- GitHub authentication.
- Model credentials or session configuration.
- Local repository paths.
- Registered repositories.
- Runtime locks.
- Temporary worktrees.
- Live logs.
- Disposable cache.
- UI preferences.

The local machine should not be the source of truth for:

- Feature state.
- Bug state.
- PRD state.
- Design state.
- Workflow state.
- Open questions.
- Accepted answers.
- Agent decisions.
- Verification results.

Recommended local layout:

```text
~/.agentspec/
  config.yaml
  cache/
  locks/
  logs/
```

Recommended committed repository layout (canonical definition in `06-RepositorySpec.md`):

```text
projectspec.yaml

.agent/
  workflows/
  prompts/
  models.yaml
  labels.yaml
  context/

.gamespec/
  phoenix.gamespec.yaml

docs/
  prds/
  adrs/
  architecture/
```

---

### 3.3 Agents act through the user’s GitHub account

For the personal cockpit, agents should appear as the user on GitHub.

There is no bot account for v1.

This simplifies setup and matches the personal-tooling goal, but it requires explicit metadata in commits, comments, and PR descriptions so automated activity remains auditable.

Each automated GitHub action should include AgentSpec metadata.

Example comment metadata:

```markdown
<!-- agentspec:run
id: run-2026-07-01-004
workflow: issue-implementation
agent: tdd-developer
model: local:qwen3-coder
state: ready-for-human-review
source_issue: #42
-->
```

Example commit footer:

```text
AgentSpec-Run: run-2026-07-01-004
Agent: tdd-developer
Issue: #42
```

This allows the cockpit to distinguish human-authored work from agent-authored work even though GitHub displays the same account identity.

---

### 3.4 Human-in-the-loop decisions are durable GitHub comments

Agents must ask questions when they encounter ambiguity.

The durable record of these questions and answers is GitHub.

The cockpit is the preferred UI for answering them, but it writes the answer back to GitHub.

A HITL question should be stored as a structured issue or PR comment.

Example:

```markdown
<!-- agentspec:question
id: q-42-001
workflow: feature-prd
agent: prd-interviewer
state: waiting-for-human
-->

Should unknown radar contacts be visible before sensor lock?

Options:

A. Always visible as fuzzy blips.  
B. Hidden until scanned.  
C. Visible only within sensor range.  
D. Custom answer.
```

The answer is also stored as a structured comment:

```markdown
<!-- agentspec:answer
question: q-42-001
-->

A. Always visible as fuzzy blips.
```

The cockpit renders these as forms, not as raw Markdown.

---

### 3.5 Subscriptions are expert escalation, not the default automation channel

Subscription products such as ChatGPT Plus, Claude Pro/Max, and Gemini subscriptions are valuable for hard reasoning, but they are not reliable automation backends for a local orchestrator unless a provider supplies a supported automation interface.

The system therefore separates:

| Mode | Examples | Use |
|---|---|---|
| Automated local | Ollama, llama.cpp, local Qwen/DeepSeek/GLM models | Default agent loops. |
| Automated free gateway | OpenRouter free models, free provider tiers | Overflow and fallback. |
| Manual subscription escalation | ChatGPT, Claude, Gemini web/desktop apps | Difficult planning, debugging, architecture, or design review. |

The cockpit should support an **Escalate to Subscription Model** workflow.

That workflow prepares a portable prompt pack containing:

- The issue.
- Relevant PRD or GameSpec fragments.
- Relevant code excerpts.
- Repo index excerpts.
- Failing logs, where relevant.
- The exact question.
- Required output format.

The user can paste that pack into a subscription model, then paste the result back into the cockpit. The cockpit records the result in GitHub.

---

### 3.6 Agents work in isolated git worktrees

Agents must not edit the user’s active working tree directly.

Each implementation run should create an isolated worktree, kept outside the repository checkout so it cannot pollute the repo or be picked up by builds.

Example:

```text
~/.agentspec/worktrees/project-phoenix-v2/
  run-2026-07-01-004/
  run-2026-07-01-005/
```

Advantages:

- Multiple agent runs can exist at once.
- The user’s working tree is not disturbed.
- Branch switching is avoided.
- Failed runs are easy to inspect or discard.
- Locks can be applied per issue, branch, or worktree.

---

### 3.7 Agents may open PRs, but may not merge them

Agents may:

- Create branches.
- Commit to their own branches.
- Push branches.
- Open PRs.
- Update PR descriptions.
- Respond to CI failures.
- Commit fixes to the same branch.
- Request human review.

Agents may not:

- Push directly to `main`.
- Merge PRs.
- Approve PRs as if they were independent reviewers.
- Force push.
- Delete branches without approval.
- Rewrite history.
- Modify secrets.
- Delete workflows.
- Close human-created issues without approval.

The agent’s normal successful end-state is:

> Ready for Human Review

---

### 3.8 Use the existing automated test regime

For v1, agents should use the repository’s existing automated tests and CI checks.

They should not invent a large new QA stack before the cockpit is useful.

Typical checks may include:

- `cargo fmt`
- `cargo check`
- `cargo test`
- `cargo clippy`
- Existing WASM or browser build checks.
- Existing GitHub Actions workflows.

Manual tests remain human-led.

Agents may add focused automated tests where practical, especially for bug fixes and pure logic. They should not claim full validation for changes that require hands-on playtesting.

PRs should include manual test notes where relevant.

Example:

```markdown
## Manual test notes

- [ ] Launch local web build.
- [ ] Connect main screen.
- [ ] Connect phone station.
- [ ] Verify radar contacts appear correctly.
- [ ] Verify no console errors.
```

---

### 3.9 Context is generated, but design is canonical

The system should distinguish between canonical project knowledge and generated helper context.

Canonical sources include:

- Source code.
- GameSpec.
- PRDs.
- ADRs.
- Issues.
- PRs.
- Accepted design decisions.
- GitHub Wiki pages where explicitly treated as canonical or generated from canonical data.

Generated context includes:

- Repo maps.
- Architecture summaries.
- Current feature summaries.
- Dependency maps.
- API maps.
- UI maps.
- Testing summaries.
- Known-problem summaries.

Generated context may be wrong or stale. It can always be regenerated.

Recommended generated context files:

```text
.agent/context/
  repo-map.md
  architecture-summary.md
  current-features.md
  gameplay-summary.md
  dependency-map.md
  api-map.md
  ui-map.md
  testing-summary.md
  recent-decisions.md
  known-problems.md
```

Each generated context document should include freshness metadata.

Example:

```markdown
<!-- agentspec:generated-context
generator: repo-map-v1
commit: 3d92e11
generated_at: 2026-07-01T17:41:00+01:00
freshness: current
-->
```

If repository `HEAD` moves, the cockpit should mark context as stale and offer regeneration.

---

### 3.10 GameSpec is first-class

Project Phoenix currently lacks a complete captured game design. A structured game-design DSL is therefore required.

GameSpec answers:

> What is the game?

It should capture:

- Core fantasy.
- Design pillars.
- Game loop.
- Player roles.
- Stations.
- Systems.
- Mechanics.
- Content.
- Balance assumptions.
- UX intent.
- Design decisions.
- Open questions.
- Links to PRDs, issues, tests, and implementation files.

GameSpec is canonical design state. It should not silently change because code changed. It changes when the user accepts a design decision, answers a grilling session, or approves a design update.

The GitHub Wiki should be a human-readable view of GameSpec.

Recommended relation:

```text
GameSpec
  ↓ render
GitHub Wiki
```

Humans may edit the Wiki, but the preferred workflow is to update GameSpec and regenerate the Wiki.

---

### 3.11 Work is organised as Mission → Workflow → Run → Task

The cockpit should not primarily display agents or model calls.

It should display meaningful engineering objectives.

The accepted hierarchy is:

```text
Mission
  ↓
Workflow
  ↓
Run
  ↓
Task
```

Definitions:

| Term | Meaning |
|---|---|
| Mission | A long-lived engineering or design objective meaningful to the user. |
| Workflow | A reusable process applied to a mission or issue, such as Feature Development or Bug Fix. |
| Run | One execution of a workflow. |
| Task | One executable step inside a run. |

Examples of missions:

- Fleet Sensors.
- Asset Pipeline Rewrite.
- WASM Optimisation.
- Steam Release.
- Combat Prototype.
- Engineering Station.

Examples of workflows:

- Feature Development.
- Bug Fix.
- Design Capture.
- Design Grill.
- Mechanic PRD.
- Issue Decomposition.
- TDD Implementation.
- CI Repair.
- Release Preparation.
- Playtest Feedback Intake.

Agents are implementation details inside workflows.

Models are compute resources selected by the model router.

---

### 3.12 The cockpit is a local personal engineering cockpit

The system is not initially a multi-user SaaS product.

The cockpit should be:

- Local-first.
- Personal.
- GitHub-backed.
- Able to point at different repositories.
- Optimised for the user’s own workflow.
- Simple enough to build incrementally.

It does not need to generalise beyond the user’s own projects in v1, though the design should avoid hard-coding Project Phoenix unnecessarily where simple abstraction is cheap.

The cockpit’s primary home should be the Mission Board.

It should also include:

- Design Board.
- Inbox.
- Feature board.
- Bug board.
- Agent run log.
- Model monitor.
- Repo health.
- Context library.
- Audit log.

---

## 4. Design Principles

### 4.1 Harness-first engineering

The system should assume that models are unreliable.

Reliability comes from:

- Clear specifications.
- Small tasks.
- Tests.
- CI.
- Review gates.
- Context discipline.
- Audit logs.
- HITL questions.
- Explicit permissions.
- Retry limits.
- Reproducible runs.

The model is not the system. The harness is the system.

---

### 4.2 GitHub-native state

Do not create a competing project-management database.

The cockpit should enhance GitHub, not replace it.

Every meaningful project decision should be visible in GitHub through one or more of:

- Issue.
- Comment.
- Label.
- PR.
- Commit.
- Check run.
- Markdown document.
- Wiki page.

Local data may make the UI faster or smoother, but should not become authoritative.

---

### 4.3 Agents ask instead of guessing

Ambiguity should be detected and escalated.

A blocked agent is preferable to an agent that silently invents a design decision.

A good agent question should include:

- The blocking issue.
- Why the question matters.
- A small number of options.
- A recommendation, when possible.
- A custom-answer escape hatch.
- A clear statement of what will happen after the answer.

---

### 4.4 Small vertical slices

Tasks should be decomposed into independently testable vertical slices.

Avoid issues such as:

```text
Implement combat.
```

Prefer issues such as:

```text
When a laser hits an asteroid, the asteroid loses hull and the event is visible in the tactical log.
```

Each slice should be:

- Understandable.
- Testable.
- Reviewable.
- Mergeable.
- Reversible.

---

### 4.5 Design and implementation stay linked

Game design should not live only in chat transcripts or memory.

Every implementation issue should link to relevant GameSpec sections, PRDs, or design decisions.

Every GameSpec mechanic should be able to link to:

- Open questions.
- PRDs.
- Issues.
- Pull requests.
- Tests.
- Implementation files.

The system should be able to answer:

> Why does this code exist?

and

> Which design decision does this implement?

---

### 4.6 Humans own final judgement

Agents may recommend.

Agents may prepare.

Agents may test.

Agents may repair.

Humans decide:

- Major design direction.
- Architecture trade-offs.
- Merging.
- Release readiness.
- Manual validation.
- Final acceptance of a feature.

The cockpit exists to reduce coordination burden, not to remove human authorship.

---

### 4.7 Models are interchangeable

No workflow should depend on one specific model.

Agents request model **skills** (not to be confused with capabilities, which are tool permissions) such as:

- planner
- coder
- reviewer
- debugger
- summariser
- game-designer
- tester
- researcher

The router selects an available model based on:

- Task type.
- Required context size.
- Local availability.
- Rate limits.
- Cost mode.
- Privacy constraints.
- Manual escalation options.

---

### 4.8 Stateless agents

Agents should not have private long-term memory.

Each run reconstructs its context from:

- The source issue or PR.
- GameSpec.
- AgentSpec workflow definition.
- Repository index.
- Relevant PRDs.
- Relevant ADRs.
- Relevant code.
- Recent comments.
- CI logs.
- Accepted answers.

This makes runs more reproducible and reduces hidden state.

---

## 5. System Architecture

At the highest level:

```text
GitHub
  stores durable engineering state

GameSpec
  stores canonical game-design state

AgentSpec
  defines missions, workflows, agents, capabilities, and execution rules

Runtime
  interprets AgentSpec and executes workflows

Cockpit
  provides the local operator interface

Models
  provide reasoning and generation capability

Local executor
  runs git, tests, builds, browser checks, and scripts
```

A more operational view:

```text
Local Cockpit
  ↓
AgentSpec Runtime
  ↓
GitHub Adapter
  ↓
GitHub Issues / PRs / CI / Wiki / Repo

AgentSpec Runtime
  ↓
Model Router
  ↓
Local Models / OpenRouter Free / Manual Subscription Escalation

AgentSpec Runtime
  ↓
Worktree Manager
  ↓
git / cargo / wasm build / browser / asset tools
```

---

## 6. Major Components

### 6.1 GitHub

GitHub is used for:

- Issues.
- PRs.
- Labels.
- Milestones.
- Branches.
- Commits.
- CI.
- Check results.
- Wiki.
- Markdown docs.
- Review history.

GitHub is the source of truth for durable engineering state.

---

### 6.2 Local cockpit

The cockpit is a local web application.

It should show the project as active work, not as a pile of chats.

Primary screens:

| Screen | Purpose |
|---|---|
| Mission Board | Shows long-lived objectives, progress, blockers, active workflows, linked issues and PRs. |
| Design Board | Shows GameSpec areas, design completeness, open questions, and design-to-implementation links. |
| Inbox | Shows blocked questions, pending approvals, failed runs, CI failures, and review requests. |
| Feature Board | Shows feature lifecycle from request to PRD to issues to PRs. |
| Bug Board | Shows bug lifecycle from report to reproduction to fix to regression test. |
| Agent Runs | Shows active and historical workflow runs, tasks, logs, retries, and outcomes. |
| Model Monitor | Shows local models, provider status, free gateway availability, manual escalation packs, and routing choices. |
| Repo Health | Shows CI status, stale branches, stale context, failing tests, open PRs, and branch drift. |
| Context Library | Shows generated repo maps, architecture summaries, GameSpec, ADRs, and Wiki sync status. |
| Audit Log | Shows what automated actions were taken and where they were recorded in GitHub. |

---

### 6.3 AgentSpec

AgentSpec defines:

- Missions.
- Workflows.
- Runs.
- Tasks.
- Agents.
- Capabilities.
- Tool permissions.
- HITL questions.
- GitHub state mapping.
- Model routing requirements.
- Verification gates.
- Retry rules.
- Failure modes.
- State transitions.

AgentSpec is the control language for the agentic harness.

---

### 6.4 GameSpec

GameSpec defines:

- Game identity.
- Core experience.
- Design pillars.
- Game loops.
- Player roles.
- Stations.
- Mechanics.
- Systems.
- Content.
- Balance assumptions.
- UX intent.
- Open questions.
- Accepted design decisions.
- Links to implementation.

GameSpec is the design language for the game.

---

### 6.5 Runtime

The runtime:

- Reads AgentSpec.
- Watches GitHub events or polls GitHub.
- Schedules workflow runs.
- Creates worktrees.
- Loads context.
- Calls models through the router.
- Executes tools within declared capabilities.
- Writes durable state back to GitHub.
- Handles HITL blocking.
- Handles retries and failure.
- Updates the cockpit.
- Records run summaries.

The runtime is local-first.

---

### 6.6 Model router

The model router maps agent capability requests to available models.

Example skill request:

```yaml
requires:
  skill: coder
  context: medium
  privacy: local-preferred
  automation: required
```

Example routing policy:

```yaml
coder:
  prefer:
    - local:qwen3-coder
    - local:deepseek-coder
    - openrouter:free-code
  escalate:
    - manual:claude
    - manual:chatgpt
```

The agent does not know which concrete model is selected.

---

## 7. GitHub State Model

The initial GitHub state model should use labels heavily.

The canonical label set is defined in `06-RepositorySpec.md`. In summary:

```text
type:feature
type:bug

state:needs-grilling
state:prd-draft
state:needs-human
state:ready-for-work
state:agent-working
state:blocked
state:pr-open
state:ci-failed
state:human-review
state:done

mission:fleet-sensors
mission:asset-pipeline
mission:wasm-optimisation
```

The `mission:<id>` group links issues to missions so the Mission Board can filter without parsing comments. Additional type labels (e.g. `type:prd`, `type:design-question`, `type:task`) may be added per project and documented in `.agent/labels.yaml`. There is no `agent:*` label group; agent authorship is recorded in structured `agentspec:*` metadata comments instead.

Long-lived specs should be stored as Markdown files.

Recommended:

```text
docs/prds/
docs/adrs/
docs/design-decisions/
```

Game design should be stored as GameSpec plus rendered Wiki pages.

Generated context should be stored under:

```text
.agent/context/
```

or regenerated into the cockpit cache if not intended for review.

---

## 8. Workflow Families

The suite should eventually support at least the following workflow families.

### 8.1 Feature Development

Rough flow:

```text
Feature Request
  ↓
Design/PRD Grilling
  ↓
PRD
  ↓
Issue Decomposition
  ↓
TDD Implementation
  ↓
CI Verification
  ↓
Human Review
  ↓
Merge
```

### 8.2 Bug Fix

Rough flow:

```text
Bug Report
  ↓
Triage
  ↓
Reproduction
  ↓
Minimisation
  ↓
Hypothesis
  ↓
Fix
  ↓
Regression Test
  ↓
CI Verification
  ↓
Human Review
  ↓
Merge
```

### 8.3 Game Design Capture

Rough flow:

```text
Design Notes
  ↓
Design Grill
  ↓
GameSpec Update
  ↓
Wiki Render
  ↓
Open Questions / Feature Requests
```

### 8.4 Mechanic PRD

Rough flow:

```text
GameSpec Mechanic
  ↓
Implementation Questions
  ↓
Mechanic PRD
  ↓
Feature Issues
```

### 8.5 Playtest Feedback Intake

Rough flow:

```text
Playtest Notes
  ↓
Cluster Feedback
  ↓
Separate Bugs / Design Issues / UX Problems
  ↓
Update GameSpec or Create Issues
```

### 8.6 Context Refresh

Rough flow:

```text
Merged PR / GameSpec Update / ADR
  ↓
Regenerate Repo Index
  ↓
Mark Context Fresh
  ↓
Report Summary
```

---

## 9. Non-Goals

The v1 system is not:

- A SaaS product.
- A multi-user team platform.
- A replacement for GitHub.
- A replacement for human review.
- A fully autonomous engineering organisation.
- A bot identity management system.
- A paid API orchestration platform.
- A general-purpose AI chat app.
- A full project management suite.
- A full automated QA environment.
- A game engine.
- A design tool for visual assets.
- A substitute for manual playtesting.

The v1 system is:

> A local personal engineering cockpit that uses GitHub as durable state and helps one developer manage agentic game-development workflows.

---

## 10. Risks and Mitigations

### 10.1 State divergence

Risk:

> GitHub and local cockpit disagree.

Mitigation:

- GitHub is always authoritative.
- Local cache is disposable.
- Cockpit can resync from GitHub.
- Structured metadata is stored in GitHub comments and documents.

---

### 10.2 Agent overreach

Risk:

> Agent makes destructive changes.

Mitigation:

- Capability-based permissions.
- Worktree isolation.
- No direct push to main.
- No merge permission.
- No force push.
- No secret modification.
- Human approval gates.

---

### 10.3 Poor design capture

Risk:

> Agents implement features that do not fit the game.

Mitigation:

- GameSpec as canonical design.
- Design Board.
- Design grilling.
- Mechanic PRDs.
- Design consistency review.
- GameSpec-to-issue links.

---

### 10.4 Context rot

Risk:

> Generated context becomes stale or misleading.

Mitigation:

- Generated context metadata.
- Freshness checks against commit hash.
- Automatic context-refresh missions.
- Canonical sources remain separate.

---

### 10.5 Subscription automation friction

Risk:

> Subscription models cannot be used reliably by autonomous agents.

Mitigation:

- Treat subscriptions as manual expert escalation.
- Generate prompt packs.
- Record outputs in GitHub.
- Use local/OpenRouter-free models for automated loops.

---

### 10.6 False confidence from tests

Risk:

> Existing tests pass but feature is bad in-game.

Mitigation:

- Manual test checklist.
- Human review.
- Playtest feedback workflow.
- GameSpec design review.
- Agents state what was and was not verified.

---

### 10.7 GitHub API rate limits

Risk:

> The runtime polls GitHub with the user's personal token (5,000 requests/hour) and hits rate limits, delaying HITL answers and staleness detection.

Mitigation:

- Use conditional requests (ETags) so unchanged resources cost no quota.
- Poll only issues with active runs; back off idle repositories.
- Cache aggressively; treat the cache as disposable.
- Consider a webhook listener as future work (see RuntimeSpec §13).

---

### 10.8 Hidden agent memory

Risk:

> Future runs depend on private, unrecoverable state.

Mitigation:

- Agents are stateless.
- Durable decisions go into GitHub.
- Context is reconstructed from canonical sources.

---

## 11. Initial Implementation Shape

The first usable version should be deliberately small.

### 11.1 Minimal useful v1

The smallest useful system should support:

1. Register a local repository.
2. Authenticate to GitHub using the user’s account.
3. Read issues, labels, PRs, and CI state.
4. Display a Mission Board.
5. Display a HITL Inbox.
6. Ask and answer structured GitHub-backed questions.
7. Run a single workflow: Feature Request → PRD Grill.
8. Write the PRD to `docs/prds/`.
9. Decompose the PRD into GitHub issues.
10. Generate a manual subscription escalation pack.
11. Run an automated local model for simple classification/summarisation.
12. Use GitHub as the durable record.

This v1 does not need to write code autonomously yet.

### 11.2 First implementation milestone

Milestone 1:

> A feature request issue can be grilled into a PRD using the cockpit, with all questions, answers, and the final PRD stored in GitHub.

This proves:

- GitHub state model.
- Cockpit HITL UX.
- AgentSpec workflow execution.
- Model routing.
- Durable state.
- Human review pattern.

### 11.3 Second implementation milestone

Milestone 2:

> A PRD can be decomposed into linked GitHub issues.

This proves:

- Agent-driven planning.
- GitHub issue creation.
- Workflow progression.
- Mission Board progress.
- Agent summaries.

### 11.4 Third implementation milestone

Milestone 3:

> A small implementation issue can be handled in an isolated worktree and turned into a PR.

This proves:

- Worktree management.
- Local execution.
- Existing test regime.
- PR creation.
- Human review gate.

---

## 12. Relationship Between the Specs

The suite should remain layered.

```text
EngineeringVision
  defines the philosophy and accepted decisions

AgentSpec
  defines how work happens

GameSpec
  defines what the game is

CockpitSpec
  defines how the operator sees and controls the system

RuntimeSpec
  defines how the system executes
```

Dependencies should be one-directional where possible.

```text
CockpitSpec depends on AgentSpec concepts.
RuntimeSpec implements AgentSpec.
AgentSpec may reference GameSpec as context.
AgentSpec and RuntimeSpec read ProjectSpec for build and test commands.
RepositorySpec defines the layout and labels the other specs rely on.
PromptLibrarySpec is consumed by RuntimeSpec when assembling prompts.
GameSpec should not depend on RuntimeSpec.
EngineeringVision may refer to all documents.
```

GameSpec should be usable without the cockpit.

AgentSpec should be usable for non-game repositories.

The cockpit should be able to display both AgentSpec and GameSpec concepts, but should not define either language.

---

## 13. Key Terms

### Agent

A role-specific executor that performs a bounded part of a workflow.

Agents do not own the overall project. They perform tasks inside workflows.

Examples:

- PRD interviewer.
- Issue decomposer.
- TDD developer.
- Bug reproducer.
- CI repairer.
- Design reviewer.
- Wiki renderer.

---

### AgentSpec

The DSL and semantic model for missions, workflows, runs, tasks, agents, capabilities, tool permissions, model routing, HITL, GitHub state, and verification gates.

---

### Cockpit

The local web application used by the human operator to view, guide, approve, and monitor the system.

---

### GameSpec

The DSL and semantic model for the game’s design state.

---

### HITL

Human-in-the-loop interaction.

In this suite, HITL primarily means structured questions and approvals stored in GitHub and rendered nicely in the cockpit.

---

### Mission

A long-lived engineering or design objective meaningful to the user.

Examples:

- Fleet Sensors.
- Asset Pipeline Rewrite.
- Engineering Station.
- Combat Prototype.

---

### Workflow

A reusable process that advances a mission or issue.

Examples:

- Feature Development.
- Bug Fix.
- Design Grill.
- Mechanic PRD.
- Context Refresh.

---

### Run

One execution of a workflow.

A run has:

- ID.
- Source object.
- State.
- Agent steps.
- Model calls.
- Tool calls.
- Logs.
- Result.
- GitHub summary.

---

### Task

One executable step inside a run.

Examples:

- Ask design question.
- Generate PRD.
- Create child issues.
- Run `cargo test`.
- Commit changes.
- Open PR.

---

### Capability

A permission or tool group granted to a workflow or agent.

Examples:

- read.
- edit.
- git.
- build.
- browser.
- asset.
- dangerous.

---

### Repository Index

Generated context that helps agents understand the repository without reading everything every time.

Not canonical.

---

### Design Board

Cockpit screen showing GameSpec coverage, open questions, unresolved mechanics, and design-to-implementation links.

---

### Mission Board

Cockpit home screen showing long-lived objectives, current state, blockers, active workflows, linked GitHub objects, and next actions.

---

## 14. Open Questions

These are not blockers for the first implementation, but they should be resolved later.

### 14.1 ProjectSpec

**Resolved.** Repository-level configuration is now its own document: `05-ProjectSpec.md`, realised as `projectspec.yaml` at the repository root. Workflow and model configuration remain in:

```text
.agent/workflows/
.agent/models.yaml
```

### 14.2 GitHub Wiki authority

Should GitHub Wiki pages be treated as canonical design content, or always generated from GameSpec?

Recommendation:

> Prefer generated from GameSpec, but allow manual wiki pages for essays, rationale, or temporary notes.

### 14.3 Model provider abstraction

Should the system use LiteLLM, OpenRouter, direct Ollama calls, or a custom provider abstraction?

Recommendation:

> Define a provider interface in RuntimeSpec. Do not commit the DSL to one provider.

### 14.4 Agent transcript storage

Should full prompt/response transcripts be stored locally only, in GitHub, or optionally exported?

Recommendation:

> Store summaries in GitHub. Store full transcripts locally by default. Allow explicit export when useful.

### 14.5 Multi-repository support

How much multi-repository support is needed?

Accepted answer:

> The cockpit should be able to point at different repositories, but does not need to generalise into a multi-tenant platform.

### 14.6 Automated browser testing

Should Playwright or similar browser tests be introduced?

Accepted answer:

> Not for v1. Use the existing test regime first. Add manual checklists. Introduce browser automation only when specific repeated manual checks become painful.

---

## 15. Review Checklist

This document should be reviewed for:

- Whether the accepted decisions are accurate.
- Whether the GitHub/local-state split is correct.
- Whether the v1 scope is small enough.
- Whether GameSpec has the right level of authority.
- Whether the Mission → Workflow → Run → Task hierarchy is accepted.
- Whether subscriptions-as-manual-escalation is acceptable.
- Whether any non-goals should become goals.
- Whether `ProjectSpec` (now `05-ProjectSpec.md`) captures the right repository-level facts.

---

## 16. Next Document

The next document should be:

```text
01-AgentSpec.md
```

It should define the formal workflow language and semantics.

It should cover:

- File format.
- Mission schema.
- Workflow schema.
- Run state machine.
- Task semantics.
- Agent definitions.
- Capabilities.
- GitHub state mapping.
- HITL comment format.
- Model routing contract.
- Verification gates.
- Retry behaviour.
- Failure modes.
- Examples for Project Phoenix.
