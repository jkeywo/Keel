# ProjectSpec Specification

**Status:** Draft v0.1

## Purpose

`ProjectSpec` describes the engineering environment for a repository.  It defines
the languages, build steps, testing strategy, style guidelines, directory
layout and other metadata that an AgentSpec‐based runtime needs in order to
work on the project effectively.  While GameSpec captures the *design* of the
game and AgentSpec captures *how* work is performed, ProjectSpec captures the
technical context in which that work is executed.  It enables the runtime to
discover how to build, format, test and package the code without hardcoding
assumptions about a particular technology stack.

## Scope

This specification covers the structure and allowable fields for a
`projectspec.yaml` file (or equivalently named file, see below).  It does not
describe CI/CD workflow behaviour (which belongs in RepositorySpec) nor the
details of game mechanics (which belong in GameSpec).  It may be extended to
cover multiple targets or variants of a project.

## Design Goals

1. **Self‑describing environment.** The runtime should be able to read one
   file to understand the build and test environment without manual
   configuration.
2. **Platform agnostic.** The specification should support different
   programming languages and toolchains (Rust, C#, C++, TypeScript, Python,
   etc.) as well as multiple targets (native, web, mobile).
3. **Modularity.** Complex projects may consist of multiple modules or
   packages.  Each module may have its own build or test commands; the
   specification should accommodate both monorepos and smaller projects.
4. **Extensible metadata.** Optional fields should allow users to record
   additional information (e.g. tool versions, documentation links) without
   restricting the core format.
5. **Version control friendly.** The specification should be a simple,
   human‑editable file that can be tracked in git and reviewed alongside
   code.

## File Location and Naming

The primary ProjectSpec file **MUST** be located at the root of the
repository.  It **SHOULD** be named `projectspec.yaml` or `projectspec.yml`.
Alternative naming is allowed (`project.yml` or `.projectspec`) but may
require configuration in the runtime.

Projects that consist of multiple independent modules **MAY** include
additional ProjectSpec files in subdirectories.  The top‑level file should
import or reference these child specifications via the `modules` field.

## Format

ProjectSpec uses [YAML](https://yaml.org/) because it is human friendly and
plays well with the other specifications.  Comments begin with `#` and may be
used liberally.  Top‑level keys MUST be unique.  Fields that are not
specified are considered unspecified; default behaviour is determined by the
runtime.

### Top‑level Fields

| Field            | Type                    | Required | Description |
|------------------|-------------------------|----------|-------------|
| `language`       | string or list          | Yes      | Primary programming language(s), e.g. `rust` or `["rust", "typescript"]`. |
| `build`          | list of strings         | Yes      | Ordered list of build commands or scripts that produce a runnable artefact.  Each string is a shell command relative to the repo root. |
| `test`           | list of strings         | Yes      | Ordered list of commands to run automated tests.  These MUST return non‑zero on failure. |
| `ci`             | list of strings         | No       | Paths to CI configuration files (e.g. `.github/workflows/main.yml`).  A runtime may use these to trigger builds or read test results. |
| `style`          | list of strings or map  | No       | Code formatting tools or lints (e.g. `rustfmt`, `clippy`).  When a map, the keys are tool names and values are command lines or configuration paths. |
| `directories`    | map                     | No       | Mapping of semantic directory names to relative paths, e.g. `{ src: "src", tests: "tests", assets: "assets" }`.  Agents may use these as hints when selecting files. |
| `assets`         | map or list             | No       | Definitions of asset types and locations.  For example: `{ textures: "assets/textures", models: "assets/models" }`. |
| `modules`        | list of strings         | No       | Paths to additional ProjectSpec files for submodules.  These paths are relative to the repo root. |
| `hooks`          | map                     | No       | Lifecycle hooks for build/test.  Keys MAY include `pre_build`, `post_build`, `pre_test`, `post_test` with each value being a list of commands. |
| `scripts`        | map                     | No       | Named commands that agents or developers can invoke (e.g. `start`, `deploy`).  Each value is a shell command. |
| `variants`       | map                     | No       | Optional variations for different build targets.  Each variant defines its own `build`, `test` and optional fields. |
| `metadata`       | map                     | No       | Arbitrary key‑value pairs such as minimum tool versions, licensing, authorship or links to documentation. |
| `tools`          | list or map             | No       | List of additional tools used by the project (e.g. `bevy`, `unity`, `webpack`).  When a map, the value may include version or configuration. |

### Example

```yaml
language: rust
build:
  - cargo build --workspace --all-targets
test:
  - cargo test --workspace
ci:
  - .github/workflows/build.yml
style:
  rustfmt: cargo fmt -- --check
  clippy: cargo clippy --workspace -- -D warnings
directories:
  src: src
  tests: tests
  assets: assets
assets:
  textures: assets/textures
  models: assets/models
hooks:
  pre_build:
    - python scripts/generate_version.py
  post_test:
    - python scripts/upload_test_reports.py
scripts:
  start: cargo run --bin phoenix_bridge
  build-wasm: wasm-pack build --target web
variants:
  wasm:
    build:
      - wasm-pack build --target web
    test:
      - wasm-pack test --headless --firefox
metadata:
  bevy_version: "0.13"
  description: "Bridge simulator for Project Phoenix"
tools:
  - bevy
  - wasm-pack
```

### Multiple Languages Example (Unity game with web front‑end)

```yaml
language:
  - csharp
  - javascript
build:
  - dotnet build UnityProject/UnityProject.csproj
  - npm install --prefix web
  - npm run build --prefix web
test:
  - dotnet test UnityProject/UnityProject.Tests.csproj
  - npm test --prefix web
style:
  dotnet-format: dotnet format UnityProject/UnityProject.sln --verify-no-changes
  eslint: npm run lint --prefix web
directories:
  unity: UnityProject
  web: web
modules:
  - UnityProject/Assets/Subpackage/projectspec.yaml
scripts:
  start-server: npm run start --prefix web
metadata:
  unity_version: "2023.1"
  node_version: "18.x"
```

### Relation to Other Specifications

* **GameSpec** describes the *game design*; ProjectSpec describes the
  *implementation environment*.  Changes to gameplay mechanics update
  GameSpec; changes to technology stacks update ProjectSpec.
* **AgentSpec** uses ProjectSpec to determine which build and test commands to
  run, where to find source files and assets, and which tools may be
  available.  The `context.required_sources` field in AgentSpec tasks may
  reference directories defined here.
* **RepositorySpec** defines the repository layout and conventions; ProjectSpec
  provides a structured summary of the development environment inside that
  layout.

## Future Extensions

Future versions may add explicit version constraints, dependency lists,
platform‑specific overrides, or integration with package managers.  Backwards
compatibility MUST be maintained by treating unknown fields as metadata.