# Implementation Roadmap

**Status:** Draft v0.1

## Purpose

The Implementation Roadmap provides a suggested sequence of milestones for
building the Agentic Engineering system described by the specifications.  It
breaks down the work into phases, identifies dependencies and highlights
deliverables.  This roadmap is aspirational; projects may choose to reorder
or parallelise tasks depending on team size and priorities.  It assumes that
the repository structure and specifications are already available.

## Phases and Milestones

### Phase 0 – Preparation and Bootstrapping

1. **Define repository layout and labels.**
   * Create `.agent/` directory with subfolders for workflows and prompts.
   * Create `.gamespec/` and `projectspec.yaml` following RepositorySpec and
     ProjectSpec.
   * Initialise GitHub repository with labels defined in `labels.yaml`.
   * Set up issue and pull request templates.
2. **Generate initial workflows.**
   * Write basic mission and workflow definitions in `.agent/workflows/` for
     feature development and bug fixing.  Use AgentSpec grammar.
   * Populate the prompt library with initial prompts (PRD interviewing,
     issue decomposition, code generation, review).
3. **Write a minimal GameSpec.**
   * Define core pillars, roles and a few systems.
   * Link open questions to GitHub issues.

### Phase 1 – Core Runtime

1. **Repository parser.**
   * Implement a parser for RepositorySpec, ProjectSpec and GameSpec.
   * Validate directory structure and report missing required files.
2. **Agent runtime scheduler.**
   * Implement the Run Manager and Scheduler as described in RuntimeSpec.
   * Support mission → workflow → run → task hierarchy, state machine and
     context assembly.
   * Implement the capability sandbox and worktree manager.  Ensure
     operations are isolated and do not modify `main`.
3. **Model router.**
   * Parse `models.yaml` and implement selection logic based on capability,
     context budget and provider preferences.
   * Integrate with local models and free providers.  Provide manual
     escalation workflow for subscription models.
4. **Prompt execution engine.**
   * Load prompts from `.agent/prompts/`, parse frontmatter and fill
     placeholders.  Respect context budgets when constructing prompts.
   * Implement summarisation or task splitting when context size exceeds
     model budgets.
5. **GitHub adapter.**
   * Create issues, comments, labels, branches and pull requests via GitHub
     API.  Use a personal access token or `gh` CLI.  Ensure all actions are
     performed as the authenticated user.
6. **CI integration.**
   * Implement reading CI results from GitHub Checks API.  Mark runs as
     failed or passed accordingly.

### Phase 2 – Cockpit and Human Interface

1. **Web application skeleton.**
   * Create a local web server (e.g. using Node.js or Rust) serving an SPA
     built with a modern front‑end framework (React, Vue or similar).
   * Implement authentication with GitHub and local user settings.
2. **Mission Board implementation.**
   * Display active missions, progress bars, current state and blocking
     items.  Support filtering and searching.
3. **Design Board implementation.**
   * Render GameSpec content, allow editing of design elements and open
     questions.  Commit changes back to `.gamespec/` via GitHub.
4. **Inbox implementation.**
   * Show pending HITL questions, reviews and merge tasks.  Provide forms
     for answering questions or merging PRs.  Write responses back to
     GitHub.
5. **Run Viewer.**
   * Display run timelines, logs, context usage and model selections.  Allow
     users to retry steps or choose alternate models.
6. **Model Monitor.**
   * Show available models, context windows, safe prompt budgets and usage.
     Alert users when a task exceeds the selected model’s budget.
7. **Repo Health and Context Library.**
   * Visualise CI status, failing tests and stale branches.  Provide a
     library view for PRDs, ADRs, context summaries and architecture docs.

### Phase 3 – Advanced Workflows and Features

1. **Workflow library expansion.**
   * Develop additional workflows (architecture review, research tasks,
     balance tuning, playtest intake, release preparation).  Create
     corresponding prompts.
2. **Context generation workflows.**
   * Automate regeneration of repo map, dependency map and Wiki pages.
   * Implement freshness tracking as described in the Engineering Vision.
3. **GameSpec integration.**
   * Enable agents to query GameSpec and populate PRDs or grills from
     design elements.
4. **Playtesting and simulation.**
   * Integrate with browser automation (e.g. Playwright) to run the game
     build, simulate inputs and capture outputs for manual review.
5. **Notifications and integrations.**
   * Add Slack/Discord notifications for new Inbox items or run status
     changes.
   * Integrate with calendar or task tools to schedule playtests or design
     reviews.

### Phase 4 – Stabilisation and Hardening

1. **Security audit.**
   * Review capability sandbox to ensure commands cannot perform
     disallowed actions (e.g. network access to restricted hosts).
2. **Performance improvements.**
   * Optimise context summarisation and caching.  Lazy load large files.
3. **Model evaluation and tuning.**
   * Track model performance across tasks.  Adjust model routing priorities
     and context budgets.  Consider training or fine‑tuning custom models.
4. **Documentation and community guidelines.**
   * Write documentation for new developers on how to use the system.
   * Provide contribution guidelines for adding workflows or prompts.

## Estimated Timeline

The timeline depends heavily on available resources.  A plausible schedule
for a small dedicated team might be:

| Phase                     | Duration |
|--------------------------|---------|
| Phase 0                  | 2 weeks |
| Phase 1                  | 4–6 weeks |
| Phase 2                  | 6–8 weeks |
| Phase 3                  | 6–8 weeks |
| Phase 4                  | Ongoing |

Milestones within phases can be parallelised if multiple developers are
available.  Some tasks (e.g. prompt library expansion) can begin earlier
once the core runtime is in place.

## Risk and Mitigation

* **Model limitations.** Local models may not handle large contexts.
  *Mitigation:* Use summarisation and splitting strategies; allow manual
  escalation to subscription models.
* **GitHub API changes.**  GitHub features evolve over time.
  *Mitigation:* Isolate GitHub adapter logic; monitor API updates; support
  caching and retries.
* **Complexity creep.**  Many features could overwhelm a small team.
  *Mitigation:* Keep the roadmap scoped; prioritise critical workflows; avoid
  premature optimisation.

## Conclusion

This roadmap outlines a structured approach to building an Agentic
Engineering system.  Each phase builds upon the previous one, gradually
introducing complexity and functionality.  Teams should regularly review
progress, adjust milestones and refine the roadmap as real‑world feedback
and requirements evolve.