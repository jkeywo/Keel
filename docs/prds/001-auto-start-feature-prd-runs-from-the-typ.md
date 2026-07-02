# PRD: Auto-start feature-prd runs from type:feature label

## Summary
Extend the agent runtime to support `github_label` triggers, specifically enabling automatic dispatch of `feature-prd` workflows when an issue receives the `type:feature` label. The implementation replaces manual cockpit initiation with a polling-based detection loop that respects GitHub API constraints, prevents duplicate executions via canonical GitHub annotations, and surfaces failures directly on the source issue.

## Goals
- Automate `feature-prd` run initiation upon detection of `type:feature` label to eliminate manual operator intervention.
- Ensure idempotency by using GitHub issue annotations as the authoritative state source for processed issues.
- Minimize API quota consumption through conditional requests and rate-limit-adherent backoff strategies.
- Provide immediate failure visibility via issue comments when auto-start retries are exhausted.

## Non-goals
- Support for labels or workflows other than `type:feature` → `feature-prd`.
- Adaptive polling scheduling; interval remains static with configurable values only.
- Webhook-based triggers; scope is limited to the polling model defined in Slice 2.
- Modifying existing manual trigger capabilities in the cockpit.

## Requirements
- **REQ-01: Label Detection & Dispatch**  
  The runtime must poll GitHub issues and automatically dispatch a `feature-prd` run when an issue contains the `type:feature` label and lacks the authoritative completion annotation.
- **REQ-02: Canonical Duplicate Prevention**  
  Duplicate prevention must rely on a machine-readable metadata annotation written to the source issue as the authoritative flag. Local state caches may be used for responsiveness but are not authoritative (Spec/00 §3.1).
- **REQ-03: Configurable Polling Interval**  
  The polling interval must be defined via configuration parameters to allow operator tuning.
- **REQ-04: Rate Limit Compliance**  
  Polling requests must use conditional headers (ETags) so unchanged resources incur no quota cost. On GitHub API `429` responses, the runtime must apply exponential backoff before retrying (Spec/04-RuntimeSpec.md §5.5).
- **REQ-05: Bounded Retry & Failure Notification**  
  Transient failures during detection, annotation verification, or dispatch must trigger bounded local retries with exponential backoff. Upon exhaustion, the runtime must post a comment to the source issue explaining the failure (RuntimeSpec §9).

## Acceptance criteria
- **AC-01:** Applying `type:feature` to an issue without an existing completion annotation results in an automatic `feature-prd` run start within one polling cycle, without cockpit interaction.
- **AC-02:** Re-applying `type:feature` or re-polling an issue that already possesses the completion annotation does not trigger a new run.
- **AC-03:** Polling requests include conditional headers; responses indicating no changes return status codes that consume zero API quota.
- **AC-04:** Receipt of a GitHub `429` response causes subsequent polls to delay according to an exponential backoff curve until the rate limit resets or the poll succeeds.
- **AC-05:** Upon dispatch failure after retry exhaustion, a comment is appended to the source issue containing the error details, and no further retries occur until manual intervention or configuration change.

## Open questions
- What is the exact schema and location of the machine-readable metadata annotation (e.g., specific label suffix, hidden comment block, or issue property)?
- Does the annotation mark successful dispatch or final run completion? If completion, how are in-flight crashes handled to prevent duplicate dispatches before the annotation is written?
- What are the default values for the polling interval and retry bounds (max attempts/duration)?
- Should the runtime clear the `type:feature` label after processing, or is the annotation sufficient to prevent re-processing?
