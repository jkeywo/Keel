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
| **Docker Desktop** (optional) | Container isolation for the coding agent | `docker info` |
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

## 1b. Subscription models (Claude Code / Codex)

Keel routes **planner** and **reviewer** calls to subscription-backed CLIs
first, falling back to local models automatically when the CLI is missing,
unauthenticated, or has hit its usage limit:

- **Claude Code** (`claude -p`, needs Claude Pro/Max): works out of the box
  if you're logged in to Claude Code on this machine — nothing to configure.
- **Codex** (`codex exec`, needs ChatGPT Plus/Pro):
  `npm i -g @openai/codex` then `codex login`.

These are vendor-supported headless interfaces covered by your subscription
(Spec/00 §3.5) — no web-UI automation is involved.

### The coding agent (issue-implementation workflow)

The `issue-implementation` workflow hands a whole issue to Claude Code
(Codex fallback) in an **isolated git worktree**, runs your
`projectspec.yaml` test commands, and opens a PR. Two isolation modes:

- **Host mode** (default when no token is configured): `claude -p` runs on
  this machine with a permission allowlist (file edits + npm/git-commit
  only), cwd pinned to the worktree. Good enough to start; less isolated.
  Known issue [#11](https://github.com/jkeywo/Keel/issues/11): the git
  allowlist doesn't currently take effect, so the agent's changes are
  committed by the runtime's salvage commit instead of the agent's own
  commits — runs still complete correctly.
- **Docker mode** (recommended): the agent runs inside the `keel-agent`
  container with only the worktree mounted. Docker Desktop must be running
  when the workflow starts (see the Docker troubleshooting section below if
  it crashes at startup). Set it up once:

  ```powershell
  npm run agent:image        # build the keel-agent Docker image
  claude setup-token         # mint a long-lived subscription token
  ```

  Then add the token to `~/.agentspec/config.yaml`:

  ```yaml
  providers:
    claude_code:
      oauth_token: <token from claude setup-token>
  agent:
    mode: docker             # optional; docker is the default once a token exists
  ```

The agent never merges, never pushes to `main`, and only ever pushes its
own `agent/<issue>-<slug>` branch.

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

## 5b. Implementing an issue

Once a small issue carries `state:ready-for-work` (the decomposer labels
its child issues automatically):

1. In the cockpit, click **Start issue-implementation** and enter the issue
   number.
2. The coding agent works in a fresh worktree under
   `~/.agentspec/keel/worktrees/<run-id>` on branch `agent/<issue>-<slug>`.
   Expect 5–15 minutes; the run detail shows progress.
3. The runtime then runs your `projectspec.yaml` test commands against the
   worktree. A failure **blocks** the run with a log excerpt in the run
   detail — nothing is pushed.
4. On success the branch is pushed and a PR opens with `agentspec:pr`
   metadata and `Closes #<issue>`; the parent issue flips to
   `state:pr-open`, and an approval item appears in the Inbox.
5. **You merge on GitHub** (that's what the approval means — agents never
   merge). Merging closes the issue via the `Closes` reference. Afterwards
   you can delete the worktree:

   ```powershell
   git worktree remove "$env:USERPROFILE\.agentspec\keel\worktrees\<run-id>"
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
| Planner unexpectedly on local qwen | Subscription CLI hit its usage limit (15-min cooldown) or isn't authenticated — check the console for the routing reason |
| `docker mode needs providers.claude_code.oauth_token` | Run `claude setup-token` and add it to `~/.agentspec/config.yaml`, or set `agent.mode: host` |
| Implementation run `blocked` with "CI failed" | The agent's code didn't pass your projectspec test commands — read the log excerpt in the run detail, fix or cancel |
| Docker Desktop crashes at startup | See the section below |

### Docker Desktop crashes at startup ("An unexpected error occurred")

If Docker Desktop shows an error dialog on launch containing:

```text
starting services: initializing Inference manager: listening on
unix://...\AppData\Local\Docker\run\dockerInference: remove ...:
The file cannot be accessed by the system.
```

(or the same with `docker-secrets-engine\engine.sock`), Windows has got
into a state where **unix-socket files can't be deleted** — Docker's
startup removes old sockets before rebinding, so it crashes on the
leftovers from its previous session, every time.

Workaround (quit Docker Desktop first, then relaunch it after):

```powershell
ren "$env:LOCALAPPDATA\Docker\run" "run-broken-$(Get-Random)"
ren "$env:LOCALAPPDATA\docker-secrets-engine" "dse-broken-$(Get-Random)"
```

The **durable fix is a Windows reboot**, which clears the stuck
socket-deletion state. After rebooting, delete the debris:

```powershell
Get-ChildItem "$env:LOCALAPPDATA","$env:LOCALAPPDATA\Docker" -Directory -Filter "*broken*" | Remove-Item -Recurse -Force
```

(Disabling Docker AI in settings does *not* prevent the crash — the
Inference listener starts regardless.)

## 8. Safety notes

- **Real mode acts as you on GitHub** — comments, labels, issues, branch
  pushes, and PRs appear under your account (with `agentspec:*` metadata
  marking them as agent-authored). Use `--dry-run` when experimenting.
- Keel never merges PRs, never pushes to `main`, and never force-pushes.
  Its only pushes are `agent/<issue>-<slug>` branches from the
  issue-implementation workflow; its only working-tree writes are PRD
  files under `docs/prds/`. Issues close only when *you* merge a PR that
  references them.
