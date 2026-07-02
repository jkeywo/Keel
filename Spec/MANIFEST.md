# Phoenix Agentic Engineering Suite — Bundle Manifest

Included documents:

- `00-EngineeringVision.md`
- `01-AgentSpec.md`
- `02-GameSpec.md`
- `03-CockpitSpec.md`
- `04-RuntimeSpec.md`
- `05-ProjectSpec.md`
- `06-RepositorySpec.md`
- `07-PromptLibrarySpec.md`
- `08-ImplementationRoadmap.md`

## Precedence

Where documents disagree on a detail, the owning document wins:

| Concern | Owning document |
|---|---|
| Philosophy, accepted decisions, non-goals | `00-EngineeringVision.md` (yields to the others on concrete detail) |
| AgentSpec DSL grammar and semantics | `01-AgentSpec.md` |
| GameSpec schema and semantics | `02-GameSpec.md` |
| Cockpit screens and interactions | `03-CockpitSpec.md` |
| Runtime behaviour, security, local state | `04-RuntimeSpec.md` |
| Build/test environment description | `05-ProjectSpec.md` |
| Repository layout, labels, branch conventions | `06-RepositorySpec.md` |
| Prompt file format and conventions | `07-PromptLibrarySpec.md` |
| Build sequencing | `08-ImplementationRoadmap.md` |

A conflict between documents is a defect: fix the non-owning document to
match the owner rather than working around the disagreement.

## Notes

- This bundle contains the most up-to-date Markdown specifications available in the active workspace.
- Commit these files into the target repository to make GitHub the canonical store.
