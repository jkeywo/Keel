# CockpitSpec Specification

**Status:** Draft v0.1

## Purpose

CockpitSpec defines the user interface and interaction model for the local engineering cockpit. The cockpit is the operator’s primary tool for observing and controlling the agentic engineering system. It exposes missions, workflows, runs, tasks, models, design artefacts and repository health in a coherent and actionable web interface. CockpitSpec does not prescribe implementation details such as specific frameworks or visual design; instead, it defines the screens, components and interactions that any compliant cockpit must provide.

## Scope

This specification covers:

* **Terminology.** Key concepts and UI elements used throughout the cockpit.
* **Design goals.** The guiding principles for cockpit behaviour and presentation.
* **Screen definitions.** The canonical set of views: Mission Board, Design Board, Inbox, Agent Runs, Model Monitor, Repo Health, Context Library and Audit Log.
* **Interaction flows.** How users initiate workflows, respond to questions, review runs, merge work and regenerate context.
* **Context budget awareness.** Displaying model context limits and task prompt sizes.
* **Integration.** Mapping between UI elements and underlying AgentSpec, GameSpec and RuntimeSpec concepts.
* **Future extensions.** Possible enhancements to the cockpit.

CockpitSpec does not define styling, colour schemes or theming. Those concerns are left to implementations. It also does not describe runtime internals; that is handled by RuntimeSpec. Game design content is managed by GameSpec.

## Design Goals

1. **Transparency.** The cockpit should make it clear what the system is doing. Every agent action, run state, model selection and context decision should be visible to the user.
2. **Control.** Users must be able to start, stop, retry, abort and modify runs. No automated action should be irreversibly committed without human approval when required.
3. **Context awareness.** The cockpit must expose the context window and safe prompt budget of each model, the estimated prompt size of each task, and highlight when a task will require summarisation or escalation. This supports context engineering as described in the Engineering Vision.
4. **Human-in-the-loop.** Questions from agents should appear promptly in an Inbox; the user should be able to answer them with minimal friction. The cockpit should never hide or discard questions.
5. **Scalability.** The UI must handle multiple missions, workflows and runs simultaneously, with filtering and search to avoid overwhelming the user.
6. **Extensibility.** New screens and components should be pluggable. The cockpit should adapt to new capabilities, tasks and models without large redesigns.
7. **GitHub fidelity.** All durable state is persisted in GitHub. The cockpit should not display stale data; it must reflect the latest issue labels, comments, PR statuses and commits.

## Terminology

* **Mission Board.** The home page showing a list of active missions, their progress, current workflow, blocking state and high-level status.
* **Design Board.** A view into the GameSpec, showing design pillars, core loops, systems, mechanics, roles, open questions and decisions. It allows designers to capture and update game design in a structured way.
* **Inbox.** A queue of items requiring human attention: grilling questions, review tasks, merge approvals, blocked runs and manual escalations.
* **Agent Runs.** A detailed view of each active and completed run, including step logs, produced files, context used, model selection, time and token consumption.
* **Model Monitor.** A panel displaying the available models, their context windows, safe prompt budgets, current usage and suitability for tasks. It highlights when a task’s estimated prompt size exceeds the budget of the currently selected model.
* **Repo Health.** A dashboard summarising CI status, failing tests, stale PRs, unreviewed PRs, branch drift and other repository hygiene metrics.
* **Context Library.** An explorer for repo-wide artefacts such as PRDs, GameSpec files, Repo Index summaries, ADRs and architecture notes. Agents use this library to assemble prompts.
* **Audit Log.** An immutable log of agent actions, including run IDs, steps executed, model calls, file diffs, comments posted and state transitions.

## Screen Definitions

### Mission Board

The Mission Board displays a card for each active mission. Each card shows:

* Mission title and identifier.
* Progress bar indicating the percentage of workflows completed.
* Current workflow name and step.
* A small status icon (running, waiting, blocked, failed, completed).
* A list of blocking items (e.g. unanswered questions, failing tests).
* Links to related issues, PRs and GameSpec entries.

Users can filter missions by status, search by name, and archive completed missions. Clicking a card opens the mission detail page, showing the list of workflows, runs and artefacts.

### Design Board

The Design Board mirrors the hierarchy of GameSpec. Sections are collapsible and editable:

* **Pillars.** Display the immutable design pillars. Editing pillars requires a design decision workflow.
* **Core Loop.** Show the moment-to-moment, encounter and session loops as diagrams or lists.
* **Roles.** List each player role with its fantasy, responsibilities, tensions and UI expectations.
* **Systems.** Display system cards (e.g. Sensors, Weapons) with purpose, status, open questions and links to mechanics and implementation.
* **Mechanics.** List mechanics with inputs, outputs, constraints and linked implementation.
* **Open Questions.** Show unresolved questions. Each question can be promoted to a grilling session or resolved as a design decision.
* **Design Decisions.** List decisions with rationale, alternatives, status and links to PRDs and ADRs.

The Design Board integrates with the GameSpec YAML file. Edits made in the cockpit are committed back to the repository as updates to GameSpec.

### Inbox

The Inbox collects all items requiring human intervention. Each entry includes:

* Item type: question, review, merge, test failure, context overflow, escalation request.
* Associated mission, workflow, run and step.
* The question text or required action.
* Options or suggested answers (for grilling questions).
* Buttons to respond, approve, reject, retry or assign.

Inbox items are sorted by urgency and age. When a user answers a question, the cockpit writes an `agentspec:answer` block to the corresponding issue, clearing the item from the Inbox.

### Agent Runs

For each run, the cockpit shows:

* Run ID, mission and workflow.
* Current state (pending, running, waiting for human, blocked, failed, completed).
* Timeline of steps with start/end times, agent type, model used, context profile, prompt size and result summary.
* Links to produced artefacts (files, branches, PRs, test reports).
* Live logs of agent output and runtime actions.

The user can expand a step to view the full prompt and response (for debugging), the context sources used and the estimated token counts. If a run is blocked or waiting, the user may retry the step, alter the context profile, or assign the run to a different model.

### Model Monitor

The Model Monitor lists all configured models, including local models, free models via OpenRouter and subscription models. For each model, it displays:

* Model name and provider.
* Context window size and safe prompt budget (e.g. 8k tokens context window with 6k safe prompt budget).
* Current load or rate limit status.
* Recommended usage (coding, triage, summarisation, whole-repo review, etc.).
* Availability indicators (online, offline, exhausted quota).

When the user selects a step in Agent Runs, the Model Monitor highlights which models can accommodate the estimated prompt size. If no available model can handle it, the cockpit suggests options: summarise context, split the task, or manually scope the task. Manual escalation to subscription models is supported via an “Escalate” button, which prepares a prompt pack for copying into ChatGPT, Claude or Gemini.

### Repo Health

Repo Health summarises the status of the code base:

* Latest CI run results and failing tests.
* PRs awaiting review, sorted by age.
* Branches with drift from main.
* Lint or formatting violations.
* Test coverage metrics (if available).

The cockpit can trigger a repository index regeneration or context summarisation from this view, ensuring the context library remains fresh.

### Context Library

The Context Library provides navigable access to long-lived documents used by agents:

* PRDs stored in `docs/prds/`.
* ADRs and architecture notes in `docs/architecture/`.
* GameSpec YAML and generated Wiki pages.
* Repo Index summaries (e.g. `repo-map.md`, `dependency-map.md`).

Users can search, filter and preview these documents. Agents use the same API to fetch context when constructing prompts.

### Audit Log

The Audit Log records every agent action. Entries include:

* Timestamp.
* Run ID and step.
* Agent type and model used.
* Action type (file modified, command run, comment posted, label applied).
* Summary of changes (e.g. diff statistics, number of files changed).

The log is immutable and append-only. Users can filter by run, agent, model or time range.

## Interaction Flows

### Starting Workflows

To start a workflow, the user navigates to the relevant mission and clicks “Start Workflow”. The cockpit presents any required inputs (e.g. issue label, output branch prefix) defined in AgentSpec. Once confirmed, the runtime creates a run and the Mission Board updates to show the new run.

### Answering Questions

When an agent asks a question, an item appears in the Inbox. The user reads the question, selects an option or enters a custom answer, and submits. The cockpit writes an `agentspec:answer` comment to GitHub, notifies the runtime and removes the item from the Inbox.

### Reviewing and Merging

Once a run reaches the `review` step, the Inbox shows a review item. The user views the PR in the Agent Runs view, reads the automated review notes and runs, optionally triggers manual tests, and either requests changes or approves the merge. Merging is performed by the user via the cockpit, not automatically by agents.

### Handling Context Overflows

If the runtime detects that a step’s prompt would exceed the safe prompt budget of all available models, the corresponding run enters `blocked` with a “context overflow” reason. The Inbox presents options:

* Summarise context – the runtime produces a summary of the relevant files or PRD sections and retries the step.
* Split task – the cockpit creates child runs to implement the step in smaller parts.
* Reduce files – allow the user to deselect non-essential files.
* Escalate – prepare a prompt pack for manual execution in a subscription model.

### Model Escalation

When a user chooses to manually run a step in ChatGPT, Claude or Gemini, the cockpit assembles a prompt pack containing the context, question and instructions. The user pastes this into the external model and returns with the answer. The cockpit records the external model use and continues the run.

### Context Regeneration

Whenever a PR merges or significant changes occur in GameSpec, the Repository Index or other context files, the cockpit prompts the user to regenerate context. Running the context regeneration workflow triggers the runtime to rebuild repo-map, dependency-map and other summaries. The Model Monitor displays when context is out-of-date.

## Integration

* **AgentSpec.** Each mission, workflow, run and step presented in the cockpit directly corresponds to objects defined in AgentSpec. The cockpit reads mission YAML files and displays them on the Mission Board. Capabilities, context profiles and HITL flags drive UI behaviours (e.g. showing context overflow options when `max_tokens` is reached).
* **GameSpec.** The Design Board is generated from GameSpec. Edits to design content in the cockpit update GameSpec YAML and commit changes to the repository. Open questions in GameSpec feed into the Inbox as design issues.
* **Runtime.** The cockpit communicates with the runtime via an API (not defined here) to start runs, fetch run status, submit answers and view logs. The runtime updates the cockpit via event notifications.
* **GitHub.** The cockpit uses GitHub’s API for reading issues, PRs, labels and comments; writing answers and summaries; and checking CI status. It always displays the latest canonical state from GitHub.

## Future Extensions

* **Mobile view.** A responsive design or dedicated mobile app to manage missions on the go.
* **Notifications.** Desktop or push notifications for new Inbox items, run completions or CI failures.
* **Custom dashboards.** User-defined panels for metrics like token usage, model performance, or mission KPIs.
* **Third-party integrations.** Slack, Discord or email notifications, automatic Jira ticket creation, or integration with playtesting tools.
* **Advanced analytics.** Visualisations of agent efficiency, context trimming strategies, and model selection impact.

---

This draft CockpitSpec provides a foundation for implementing a local engineering cockpit that faithfully reflects and controls the agentic engineering system. It prioritises transparency, control, context awareness and human-in-the-loop workflows, aligning with the Engineering Vision and the amendments on context budgets.
