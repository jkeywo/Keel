
# 02 – GameSpec

**Status:** Draft v0.1

## Purpose

GameSpec is the canonical, structured representation of a game's design.

It exists so humans and LLMs can reason about the same design without relying on chat history, memory or implementation details.

GameSpec answers:

> What game are we trying to build?

It deliberately does **not** describe implementation (RuntimeSpec), engineering workflows (AgentSpec), or UI (CockpitSpec).

---

# Design Goals

- Canonical design source.
- Machine-readable.
- Human-readable.
- Stable under implementation changes.
- Richly cross-linked to GitHub issues, PRDs, ADRs and code.
- Suitable for generation into a GitHub Wiki.
- Suitable for LLM reasoning.

---

# Core Principles

## Design is canonical

Code implements GameSpec.

Code does not redefine GameSpec.

## Decisions are explicit

Every significant design decision records:

- rationale
- alternatives
- status
- links to implementation

## Open questions are first-class

Unknowns are represented explicitly rather than hidden in prose.

Every open question can become:

- a grilling session
- a design issue
- a feature request

---

# Top-Level Structure

```yaml
game:
mission:
pillars:
core_loop:
roles:
systems:
mechanics:
content:
balance:
ux:
progression:
open_questions:
design_decisions:
implementation_links:
```

---

# Sections

## Game

Identity:

- title
- genre
- platform
- target audience
- design maturity
- elevator pitch

## Design Pillars

Normally three to seven immutable statements.

Example:

- Crew coordination
- Information asymmetry
- Cinematic starship combat
- Recoverable chaos

Everything should reinforce at least one pillar.

## Core Loop

Capture:

- moment-to-moment loop
- encounter loop
- session loop
- long-term progression

Represented as ordered stages with inputs, outputs and failure states.

## Roles

Each player role records:

- fantasy
- responsibilities
- information owned
- actions
- tensions
- success criteria
- UI expectations

## Systems

A system is a large interacting subsystem.

Examples:

- Sensors
- Weapons
- Helm
- Damage
- Power
- Communications

Each contains:

- purpose
- player experience
- mechanics
- interfaces
- implementation status
- linked issues

## Mechanics

Small reusable rules.

Example:

Sensor Lock

Inputs

Outputs

Constraints

Edge cases

Related systems

## UX Intent

Not mock-ups.

Instead:

"What should this feel like?"

Examples:

Weapons should feel decisive.

Engineering should feel overloaded but recoverable.

## Balance

Capture assumptions rather than exact tuning.

Examples:

Expected encounter duration

Average repair time

Weapon lethality

These become living design hypotheses.

## Content

Ships

Weapons

Stations

NPCs

Maps

Missions

Dialogue

Everything references systems instead of duplicating rules.

---

# Traceability

Every object may include:

```yaml
links:
  github:
    issues:
    prs:
  code:
  prds:
  adrs:
```

An LLM should always be able to answer:

Why does this mechanic exist?

Which code implements it?

---

# Lifecycle

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

GameSpec owns the first four stages.

---

# Wiki Generation

The GitHub Wiki is generated from GameSpec.

Suggested pages:

Home

Core Loop

Roles

Systems

Mechanics

Content

Open Questions

Design Decisions

Implementation Status

---

# LLM Workflows

GameSpec enables:

- Design grilling
- Consistency review
- PRD generation
- Mechanic decomposition
- Playtest analysis
- Balance review
- Wiki generation

---

# Project Phoenix Example

```yaml
game:
  id: project-phoenix-v2
  title: Project Phoenix V2

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

    open_questions:

      - Visibility before lock

      - Passive vs active scan

      - Contact persistence

    implementation:

      issues:
        - "#42"
```

---

# Validation

A valid GameSpec must:

- contain exactly one game object
- contain at least one design pillar
- define at least one core loop
- define at least one player role
- define at least one system
- distinguish open questions from decisions
- avoid implementation detail except through links

---

# Review Against Engineering Vision

Conformance review:

✓ GameSpec is canonical.

✓ GitHub Wiki is generated from GameSpec.

✓ Design decisions are durable.

✓ Implementation is linked, not duplicated.

✓ Suitable for LLM reasoning.

✓ Supports Project Phoenix and future repositories.

No deviations from EngineeringVision v0.1 identified.

---

# Next Document

03-CockpitSpec.md
