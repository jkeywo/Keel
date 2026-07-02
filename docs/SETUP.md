# Setting up Keel locally

Keel is a local cockpit that runs agentic workflows against a GitHub
repository. This guide takes you from a fresh Windows machine to answering
your first grill question in the browser.

## 1. Prerequisites

| What | Why | Check |
|---|---|---|
| **Node.js 20+** | Runs the runtime and cockpit | `node --version` |
| **GitHub CLI (`gh`), authenticated** | All GitHub reads/writes go through it | `gh auth status` |
| **Ollama** (recommended) | Local models for grilling, PRD writing, decomposition | `ollama list` |
| **git** | You already have this if you cloned the repo | `git --version` |

Setup commands if anything is missing:

```powershell
winget install OpenJS.NodeJS.LTS
winget install GitHub.cli
gh auth login          # choose GitHub.com, HTTPS, login via browser
winget install Ollama.Ollama
```

Without Ollama (or with it stopped), Keel falls back to the **mock model
provider**, which returns canned output — the loop still works but the
questions and PRDs are placeholders. Watch the console: if you see
`model mock:default selected`, you're on canned output.

## 2. Models

`.agent/models.yaml` maps router entries to Ollama model tags. The defaults
expect:

```powershell
ollama pull qwen3.6-coder:latest   # coder / planner
ollama pull qwen3.6:27b            # planner / reviewer (the main grilling model)
ollama pull llama3:8b              # summariser
```

Have different models installed? Run `ollama list` and edit the `model:`
fields in `.agent/models.yaml` to match — the `name:` keys and `routing:`
section can stay as they are.

A note on speed: the 27b planner takes 1–2 minutes per generation on typical
hardware. A grill round or PRD draft is not instant; the Runs table shows
`running` while the model thinks.

## 3. Run it

Double-click **`run-keel.bat`** (or run it from a terminal). It will:

1. Check Node and `gh` are available.
2. `npm install` on first run.
3. Start the cockpit and open <http://localhost:4400>.

Two modes:

```bat
run-keel.bat            :: real mode — reads/writes jkeywo/Keel as you
run-keel.bat --dry-run  :: sandbox — mock GitHub with a seeded fake issue
```

Start with `--dry-run` to learn the UI. Nothing in dry-run touches GitHub,
and PRD files go to the state directory instead of the repo.

Environment overrides (set before launching):

| Variable | Default | Meaning |
|---|---|---|
| `KEEL_PORT` | `4400` | Cockpit port |
| `KEEL_STATE_DIR` | `~/.agentspec/keel` | Local run-state cache |
| `KEEL_NO_BROWSER` | unset | Set to `1` to not auto-open the browser |

## 4. Optional config file

For a non-default repo path or GitHub repository, create
`~/.agentspec/config.yaml` (never commit this file):

```yaml
repositories:
  keel:
    path: C:/Coding/Keel
    github: jkeywo/Keel
providers:
  ollama:
    url: http://localhost:11434
```

Defaults work from a checkout of this repo, so most setups need no config
file at all.

## 5. First run walkthrough

1. Create a feature-request issue on the repo (or reuse one):

   ```powershell
   gh issue create --repo jkeywo/Keel --title "My feature" --body "As the operator I want..." --label "type:feature"
   ```

2. In the cockpit, find the **Keel Bootstrap** mission and click
   **Start feature-prd**. Enter the issue number.
3. Wait for the grill question (1–2 min on local models). It appears in the
   **Inbox** and as an `agentspec:question` comment on the issue.
4. Answer in the Inbox — pick an option or type a custom answer. Your answer
   is written back to the issue as an `agentspec:answer` comment. Up to
   three rounds of questions.
5. The PRD draft lands in `docs/prds/` and an **approval** item appears in
   the Inbox. Read the file, then Approve (or Reject with feedback, which
   blocks the run).
6. On approval, the PRD is decomposed into child issues labelled
   `state:ready-for-work` and the run completes with a summary comment.
7. The PRD file is left uncommitted — review and commit it yourself:

   ```powershell
   git add docs/prds/ ; git commit -m "Add PRD NNN" ; git push
   ```

## 6. Where things live

- **Durable state** — issues, comments, labels, PRDs: GitHub. Always
  authoritative (Spec/00 §3.1).
- **Local cache** — run records, questions, approvals:
  `~/.agentspec/keel/state.json`. Disposable; delete it to reset the
  cockpit's memory of runs (GitHub is untouched).
- **Full logs** — the console window the server runs in.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 4400 in use` / cockpit won't start | Set `KEEL_PORT` to a free port, or stop the other process |
| `gh ... exited 1` errors on runs | `gh auth status` — re-run `gh auth login` if needed |
| Questions/PRDs are generic placeholders | Ollama is offline or the model tag is missing — check `ollama list` and `.agent/models.yaml` |
| Run stuck in `running` for many minutes | Large local model still generating; check the server console. Cancel from the Runs table if truly hung |
| `run ... already active` when starting | A previous run for that issue/workflow is still open — cancel it in the Runs table first |
| `answer must begin with an option letter` | Answers must start with `A`/`B`/... or `custom: your text` |
| Want a clean slate | Stop the server, delete `~/.agentspec/keel/state.json`, restart |

## 8. Safety notes

- **Real mode acts as you on GitHub** — comments, labels, and new issues
  appear under your account (with `agentspec:*` metadata marking them as
  agent-authored). Use `--dry-run` when experimenting.
- Keel never merges PRs, never pushes code, and never closes issues in the
  current slice; the only repo-write is the PRD file in your working tree.
