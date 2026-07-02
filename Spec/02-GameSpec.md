# 02 – GameSpec

**Status:** Draft v0.2

## Purpose

GameSpec is the canonical, structured representation of a game's design.

It exists so humans and LLMs can reason about the same design without relying on chat history, memory or implementation details.

GameSpec answers:

> What game are we trying to build?

It deliberately does **not** describe implementation (RuntimeSpec), engineering workflows (AgentSpec), or UI (CockpitSpec).

---

## Design Goals

- Canonical design source.
- Machine-readable.
- Human-readable.
- Stable under implementation changes.
- Richly cross-linked to GitHub issues, PRDs, ADRs and code.
- Suitable for generation into a GitHub Wiki.
- Suitable for LLM reasoning.

---

## Core Principles

### Design is canonical

Code implements GameSpec. Code does not redefine GameSpec.

### Decisions are explicit

Every significant design decision records rationale, alternatives, status, and links to implementation.

### Open questions are first-class

Unknowns are represented explicitly rather than hidden in prose. Every open question can become a grilling session, a design issue, or a feature request.

---

## File Location and Includes

The primary GameSpec file lives at `.gamespec/<game-id>.gamespec.yaml` (see `06-RepositorySpec.md`). There is exactly one primary file per repository.

As the design grows, sections may be split into additional YAML files in `.gamespec/` and pulled in with the top-level `includes` field:

```yaml
includes:
  - systems-sensors.gamespec.yaml
  - roles.gamespec.yaml
```

Included files contain the same top-level keys as the primary file; the loader deep-merges them into the primary document. A key defined in two files is a validation error — includes partition the design, they do not override it. Included filenames MUST end with `.gamespec.yaml`.

---

## Top-Level Structure

```yaml
game:                # identity (exactly one)
premise:             # the game's premise / mission statement, one paragraph
pillars:             # 3–7 immutable design pillars
core_loop:           # nested loops from moment-to-moment to long-term
roles:               # player roles
systems:             # large interacting subsystems
mechanics:           # small reusable rules
content:             # ships, weapons, maps, missions, dialogue...
balance:             # living balance assumptions
ux:                  # experiential intent, not mock-ups
progression:         # long-term player/campaign progression
open_questions:      # explicit unknowns
design_decisions:    # accepted decisions with rationale
includes:            # optional additional .gamespec.yaml files
```

The key `premise` was previously named `mission`; it was renamed to avoid colliding with AgentSpec's Mission (a long-lived engineering objective).

---

## Section Schemas

### game

Identity. Exactly one object:

```yaml
game:
  id: project-phoenix-v2      # machine-readable, kebab-case
  title: Project Phoenix V2
  genre: cooperative bridge simulator
  platform: [browser, native]
  audience: co-op groups of 3–8 players
  maturity: prototype          # concept | prototype | vertical-slice | production
  pitch: >
    One-sentence elevator pitch.
```

### pillars

Three to seven short immutable statements. Everything else in the spec should reinforce at least one pillar.

```yaml
pillars:
  - Crew coordination
  - Information asymmetry
  - Cinematic starship combat
  - Recoverable chaos
```

### core_loop

Nested loops, each an ordered list of stages:

```yaml
core_loop:
  moment:              # seconds — one station interaction
    - stage: observe
      inputs: [sensor display]
      outputs: [contact awareness]
      failure: missed contact
    - stage: act
      inputs: [station controls]
      outputs: [ship state change]
      failure: wrong action under pressure
  encounter:           # minutes — one engagement
    - stage: detect
    - stage: engage
    - stage: resolve
  session:             # one sitting
    - stage: briefing
    - stage: missions
    - stage: debrief
  long_term:           # across sessions (may reference progression)
    - stage: campaign advancement
```

Each stage MAY carry `inputs`, `outputs`, and `failure` (what going wrong looks like); `stage` is required.

### roles

One entry per player role:

```yaml
roles:
  tactical:
    fantasy: >
      The decisive hand on the trigger.
    responsibilities: [target selection, weapons management]
    information_owned: [firing solutions, weapon status]
    actions: [lock target, fire, manage ammunition]
    tensions: [ammo scarcity vs aggression]
    success: >
      Threats neutralised without wasted resources.
    ui_expectations: >
      Fast, readable, decisive feedback.
    links: {}          # see Traceability
```

### systems

A system is a large interacting subsystem (Sensors, Weapons, Helm, Damage, Power, Communications):

```yaml
systems:
  sensors:
    status: prototype           # idea | designed | prototype | implemented | tuned
    purpose: >
      Convert uncertain battlefield information into actionable tactical intelligence.
    player_experience: >
      Tense interpretation of incomplete information.
    mechanics: [sensor-lock, passive-scan]   # ids from mechanics section
    interfaces: [tactical, helm]             # roles or systems it exchanges information with
    open_questions: [oq-sensors-visibility]  # ids from open_questions
    links:
      github:
        issues: ["#42"]
```

### mechanics

Small reusable rules, referenced by id from systems and content:

```yaml
mechanics:
  sensor-lock:
    summary: >
      Focused scan that converts a fuzzy contact into a tracked target.
    inputs: [contact bearing, scan power]
    outputs: [tracked target, target identity]
    constraints:
      - one lock per sensor operator at a time
    edge_cases:
      - contact leaves range mid-lock
    systems: [sensors]
    links: {}
```

### ux

Experiential intent, not mock-ups. Free-form statements of what things should *feel* like:

```yaml
ux:
  - Weapons should feel decisive.
  - Engineering should feel overloaded but recoverable.
```

### balance

Assumptions rather than exact tuning. These are living design hypotheses:

```yaml
balance:
  encounter_duration_minutes: 8–12
  average_repair_time_seconds: 45
  weapon_lethality: >
    Three clean hits disable a comparable ship.
```

### content

Ships, weapons, stations, NPCs, maps, missions, dialogue. Content entries reference systems and mechanics by id instead of duplicating rules.

### open_questions

```yaml
open_questions:
  oq-sensors-visibility:
    question: Should unknown contacts be visible before sensor lock?
    why_it_matters: >
      Drives the tension level of the sensor station.
    options:
      - Always visible as fuzzy blips
      - Hidden until scanned
      - Visible only within sensor range
    status: open              # open | grilling | answered
    links:
      github:
        issues: ["#42"]
```

### design_decisions

```yaml
design_decisions:
  dd-contacts-fuzzy-blips:
    decision: Unknown contacts are always visible as fuzzy blips.
    rationale: >
      Keeps the tactical display alive and rewards active scanning.
    alternatives_rejected:
      - Hidden until scanned (too passive)
    status: accepted          # proposed | accepted | superseded
    supersedes: null
    resolves: [oq-sensors-visibility]
    links:
      prds: [docs/prds/042-radar-contacts.md]
```

---

## Traceability

Every object may include a `links` block:

```yaml
links:
  github:
    issues: []
    prs: []
  code: []
  prds: []
  adrs: []
```

An LLM should always be able to answer: *Why does this mechanic exist?* and *Which code implements it?*

---

## Lifecycle

```text
Idea
  ↓
Open Question
  ↓
Decision
  ↓
Mechanic
  ↓
PRD
  ↓
Implementation
  ↓
Playtest
  ↓
Revision
```

GameSpec owns the first four stages.

---

## Wiki Generation

The GitHub Wiki is generated from GameSpec.

Suggested pages: Home, Core Loop, Roles, Systems, Mechanics, Content, Open Questions, Design Decisions, Implementation Status.

---

## LLM Workflows

GameSpec enables: design grilling, consistency review, PRD generation, mechanic decomposition, playtest analysis, balance review, and Wiki generation.

---

## Project Phoenix Example

```yaml
game:
  id: project-phoenix-v2
  title: Project Phoenix V2
  maturity: prototype

premise: >
  A cooperative starship bridge simulator where a crew shares one ship,
  incomplete information, and too little time.

pillars:
  - Crew coordination
  - Information asymmetry
  - Cinematic starship combat
  - Fast station gameplay

systems:
  sensors:
    status: prototype
    purpose: >
      Convert uncertain battlefield information into actionable tactical intelligence.
    open_questions: [oq-sensors-visibility]
    links:
      github:
        issues: ["#42"]

open_questions:
  oq-sensors-visibility:
    question: Should unknown contacts be visible before sensor lock?
    status: open
```

---

## Validation

A valid GameSpec must:

- contain exactly one `game` object (across the primary file and all includes)
- contain at least one design pillar
- define at least one core loop
- define at least one player role
- define at least one system
- use unique ids for mechanics, open questions, and design decisions
- not define the same top-level key in two included files
- distinguish open questions from decisions
- avoid implementation detail except through `links`

---

## Review Against Engineering Vision

- ✓ GameSpec is canonical.
- ✓ GitHub Wiki is generated from GameSpec.
- ✓ Design decisions are durable.
- ✓ Implementation is linked, not duplicated.
- ✓ Suitable for LLM reasoning.
- ✓ Supports Project Phoenix and future repositories.

No deviations from EngineeringVision identified.

---

## Next Document

`03-CockpitSpec.md`
