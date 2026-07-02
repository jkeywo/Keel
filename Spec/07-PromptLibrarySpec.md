# Prompt Library Specification

**Status:** Draft v0.1

## Purpose

Prompts are the heart of any large language model–driven workflow.  They
describe the task, provide context and guidance, and often specify the
format of the expected output.  A poorly maintained prompt can lead to
confusing results or break when underlying models evolve.  The Prompt Library
Specification defines how prompts are stored, structured, named and
versioned within a repository so that they can be maintained alongside
source code and design artefacts.  It also sets guidelines for prompt
authors to ensure clarity, consistency and reproducibility.

## Scope

This specification applies to all prompt files stored under `.agent/prompts/`.
It does not cover prompts generated on the fly by agents or prompts
embedded in other specifications (e.g. inline system prompts in
AgentSpec).  It provides a naming convention, a recommended file format,
metadata fields and guidelines for writing prompts.

## Design Goals

1. **Maintainability.** Prompts should be easy to locate, review and update
   via normal code review workflows.
2. **Versioning.** Changes to prompts should be explicit in git history,
   enabling rollbacks and comparisons.
3. **Reusability.** Prompts should be modular and referenceable from
   multiple workflows or tasks.
4. **Explicit metadata.** Each prompt should declare its intended use,
   inputs, outputs and any assumptions about the model or context.
5. **Clarity.** Prompt text should be clear, concise and use standard
   placeholders for dynamic content.

## File Location and Naming

All prompt files **MUST** reside in the `.agent/prompts/` directory at the
repository root.  Each prompt is stored in its own file.  The filename
**SHOULD** be kebab‑case describing the prompt's function, with an optional
suffix indicating the agent role or workflow.  Files SHOULD use the `.md`
extension for Markdown or `.prompt` for plain text.  Examples:

```
prd-interviewer.md
bug-triage.prompt
reviewer-code.md
summary-generator.md
```

Filenames form part of the identifier used in AgentSpec.  To avoid name
collisions, avoid overly generic names.

## File Format

Prompt files MAY be plain text or Markdown.  Markdown is recommended when
including examples, code blocks or lists.  At the top of each file, a YAML
frontmatter block provides metadata.  The frontmatter MUST be enclosed by
`---` lines and MUST appear before any body content.  After the frontmatter,
the body contains the actual prompt text.  Example structure:

```yaml
---
id: prd-interviewer
role: prd-interviewer
workflow: feature-prd
description: >-
  Asks the feature requester targeted questions to clarify design
  objectives and acceptance criteria before writing a Product
  Requirements Document.
inputs:
  - issue_description
  - gamespec_excerpt
outputs:
  - clarifying_questions
assumptions:
  model: any
  max_tokens: 800
---

You are an AI product interviewer working on an engineering agent team.

Your goal is to ask the minimum number of clear, specific questions
necessary to fully understand the feature request.  Use numbered lists for
your questions.  Avoid yes/no questions; prefer questions that elicit
detailed descriptions.

Feature description:
{{issue_description}}

Relevant game design:
{{gamespec_excerpt}}

Ask your questions now:

```

### Frontmatter Fields

| Field         | Type      | Required | Description |
|---------------|-----------|----------|-------------|
| `id`          | string    | Yes      | Unique identifier for this prompt file.  Used in AgentSpec `prompt` references. |
| `role`        | string    | No       | The name of the agent role associated with this prompt (e.g. `prd-interviewer`, `issue-decomposer`, `reviewer`). |
| `workflow`    | string    | No       | The workflow or task type that uses this prompt. |
| `description` | string    | Yes      | Human‑readable explanation of what the prompt does and its goal. |
| `inputs`      | list      | No       | Names of placeholders that the runtime must substitute when constructing the prompt.  Each item is a placeholder appearing in `{{double_curly_braces}}` in the body. |
| `outputs`     | list      | No       | Expected outputs or sections of the model response (e.g. `clarifying_questions`, `issue_labels`). |
| `assumptions` | map       | No       | Optional assumptions about the model (e.g. minimum context length) or the environment.  Keys might include `model`, `max_tokens`, `language` or `style`. |
| `version`     | string    | No       | Version tag for the prompt.  If omitted, the file revision in git serves as the version. |

The frontmatter may contain additional arbitrary keys.  Unknown keys MUST be
ignored by the runtime.

### Prompt Body

The body of the file is a plain‑language instruction to the model.  It may
include Markdown formatting, numbered or bulleted lists, code fences and
dynamic placeholders.  A placeholder takes the form `{{name}}` and is
replaced by the runtime with a value from the agent's context.  The body
**MUST NOT** include YAML frontmatter delimiters (`---`) outside the
frontmatter.

When writing the prompt body:

* **Provide context first.** Include necessary background information (e.g.
  feature description, relevant design excerpts) before requesting action.
* **Be explicit about the expected output format.** Tell the model whether to
  produce a list, a Markdown table, plain text, etc.
* **Use clear and concise language.** Avoid ambiguous pronouns or nested
  instructions.
* **Avoid references to internal state.** Prompts should not assume the
  existence of variables unless they are declared in `inputs`.

## Referencing Prompts in AgentSpec

Each task template in the runtime's library declares a default prompt id.
Within AgentSpec, a workflow step MAY override that default by referencing a
prompt by its `id` (see `01-AgentSpec.md`, Workflow Steps and Tasks):

```yaml
steps:
  - id: ask-clarifying-questions
    task: grill
    agent: prd-interviewer
    prompt: prd-interviewer
    context:
      required_sources:
        - issue
        - gamespec_excerpt
      budget: medium
```

The runtime loads the prompt file `.agent/prompts/prd-interviewer.md`, reads
its frontmatter to validate required inputs and constructs the final prompt
by filling placeholders with values extracted from the context.

Assumptions declared in the frontmatter (e.g. `max_tokens`) are **advisory**:
they never override the context profile declared in AgentSpec, which always
wins.  If a step's profile conflicts with a prompt's assumptions (for
example, the profile's budget is smaller than the prompt's declared
minimum), validation fails loudly at workflow load time rather than either
side being silently adjusted.  The Prompt Budgeter (RuntimeSpec §5.10) makes
the final fit decision at execution time.

## Prompt Versioning

Prompts are versioned implicitly through git.  Major changes that alter the
behaviour or expected outputs SHOULD update the `version` field in the
frontmatter (e.g. `1.0.0` → `2.0.0`).  Minor tweaks, typos or phrasing
improvements can rely on git history.  When a new version is not backward
compatible, any AgentSpec files that reference the old prompt **MUST** be
updated accordingly.

## Guidelines for Writing Prompts

1. **Single responsibility.** Each prompt should perform one logical
   operation (e.g. asking questions, decomposing an issue, reviewing code).
2. **Declare all inputs.** If a prompt uses `{{issue_description}}`, it
   must declare `inputs: [issue_description]` in the frontmatter.
3. **Structured outputs.** If the runtime expects the model to return JSON
   or a Markdown table, instruct the model clearly.  This makes the
   runtime's parsing more reliable.
4. **Avoid model names.** Prompts should not mention specific models by
   name; model selection is handled by the router.
5. **Context budgeting.** Do not include the entire repository or
   design when not needed.  Use placeholders that the runtime can fill with
   summaries or excerpts.
6. **Comment liberally.** Use comments in the frontmatter or within the
   prompt (as HTML comments `<!-- ... -->`) to explain why the prompt is
   written a certain way.

## Future Extensions

Future revisions may include support for multi‑part prompts (primer and
follow‑up), automatic prompt evaluation metrics or integration with external
prompt management systems.  Additional metadata fields (e.g. `owner`,
`created_by`, `last_tested`) may be added.  All such extensions must be
backwards compatible or flagged by the `version` field.