# Implementation Roadmap

**Status:** Draft v0.2

## Purpose

The Implementation Roadmap sequences the build of the Agentic Engineering
system described by the specifications.  It is cut as **vertical slices**
around the three milestones defined in `00-EngineeringVision.md` §11: each
slice delivers a thin but complete path through runtime, GitHub, and cockpit,
so there is something usable at the end of every slice.  Horizontal layers
(build the whole runtime, then the whole cockpit) are deliberately avoided —
they front-load weeks of work with nothing observable at the end.

This roadmap assumes a **single developer** working part-time alongside the
game project itself.  Estimates are calendar ranges at that cadence, not
full-time engineering weeks.  Slices 0–3 are the committed scope; everything
after them is aspirational and should be re-planned once the first three
milestones are real.

## Slice 0 – Bootstrap (the repo can describe itself)

Goal: the target repository conforms to RepositorySpec well enough that a
runtime could read it.

1. Create `.agent/` (workflows, prompts, `models.yaml`, `labels.yaml`),
   `.gamespec/`, `docs/prds/`, `docs/adrs/`, and `projectspec.yaml`
   following RepositorySpec and ProjectSpec.
2. Initialise GitHub labels from `.agent/labels.yaml` (the canonical set in
   RepositorySpec, including `mission:*`).
3. Enable **branch protection on `main`** and create a fine-grained PAT for
   the runtime (RuntimeSpec §10.1) — do this before any agent ever runs.
4. Write a minimal GameSpec: pillars, one core loop, one role, one or two
   systems, open questions linked to GitHub issues.
5. Write the `feature-prd` workflow definition and its prompts
   (PRD interviewer, PRD writer, issue decomposer).

Deliverable: a repository that passes a RepositorySpec validation check by
inspection.  Estimate: 1–2 weeks.

## Slice 1 – Milestone 1: Feature request → PRD (grill loop)

> A feature request issue can be grilled into a PRD using the cockpit, with
> all questions, answers, and the final PRD stored in GitHub.

Build only what this path needs, end to end:

1. **Thin runtime core.** Repository registration, GitHub auth (`gh` or
   REST with the fine-grained PAT), AgentSpec loading and validation for the
   `feature-prd` workflow, manual trigger only, run state machine.
2. **HITL loop.** `agentspec:question` / `agentspec:answer` comments,
   answer validation (RuntimeSpec §5.12), pause/resume.
3. **Thin cockpit.** Two screens only: a minimal Mission Board (list runs
   and their states) and the Inbox (render questions as forms, write
   answers back).  No Design Board, no Model Monitor yet.
4. **Model plumbing.** One local model via Ollama, prompt loading from
   `.agent/prompts/` with frontmatter parsing, basic prompt budget check,
   manual escalation pack generation (copy-out / paste-back).
5. **PRD output.** Write `docs/prds/<issue>-<slug>.md`, post the run
   summary comment.

Not in this slice: worktrees, capability sandbox beyond read/git, CI
integration, issue decomposition.  Estimate: 3–5 weeks.

## Slice 2 – Milestone 2: PRD → linked issues

> A PRD can be decomposed into linked GitHub issues.

1. Add the `decompose` task and issue-decomposer prompt to the runtime task
   library.
2. Issue creation via the GitHub adapter; child issues labelled
   `state:ready-for-work` and linked to the parent and the mission label.
3. `hitl: approval` support (the PRD approval gate before decomposition).
4. Mission Board upgrade: show mission progress from issue states.
5. First `github_label` trigger (`type:feature` starts `feature-prd`),
   with duplicate-run prevention.

Estimate: 2–3 weeks.

## Slice 3 – Milestone 3: Small issue → worktree → PR

> A small implementation issue can be handled in an isolated worktree and
> turned into a PR.

1. Worktree Manager (`~/.agentspec/worktrees/`), branch naming, locks.
2. Capability sandbox for `edit`, `git`, `build`; command runner with
   timeouts and the test-failure vs tool-failure distinction.
3. The `issue-implementation` workflow: write_test → implement → run_ci →
   open_pr → review (approval).
4. CI status reading via the Checks API.
5. Run Viewer in the cockpit (step timeline, logs, retry).

Estimate: 4–6 weeks.  At the end of this slice the Vision's "minimal useful
v1" (§11.1) is complete.

## Later slices (aspirational — re-plan after Slice 3)

These are unordered candidates, not commitments:

* **Cockpit depth.** Design Board (GameSpec editing), Model Monitor with
  context-budget display, Repo Health, Context Library, Audit Log UI.
* **Context generation.** Repository Indexer, freshness tracking,
  regeneration workflows.
* **Workflow library.** Bug fix, design grill, playtest intake, release
  preparation, and their prompts.
* **Automation depth.** `github_comment` and `scheduled` triggers, webhook
  listener to replace polling, apply_fixes loop on CI failure.
* **Hardening.** Security review of the sandbox, performance work, model
  routing tuning, browser automation (only when specific manual checks
  become painful — Vision §14.6).

## Risk and Mitigation

* **Model limitations.** Local models may not handle large contexts.
  *Mitigation:* summarisation and splitting strategies; manual escalation
  to subscription models.
* **Scope creep.** One developer, many specs.
  *Mitigation:* nothing outside the current slice; later slices stay
  unordered until Slice 3 ships.
* **GitHub API changes and rate limits.**
  *Mitigation:* isolate adapter logic; conditional requests; poll only
  active issues (RuntimeSpec §5.5).
* **The suite outgrowing its user.** The system exists to serve
  `project-phoenix-v2`, not the other way round.
  *Mitigation:* after each slice, spend time using it on real game work
  before building the next slice.

## Conclusion

Each slice ends with a demonstrable capability on the real repository.  If
the project stalls after any slice, what exists is still useful: after
Slice 1 a grilling tool, after Slice 2 a planning tool, after Slice 3 a
full agentic loop.
