import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { Capability, Mission, Workflow } from './types.js';

const KNOWN_CAPABILITIES: Capability[] = ['read', 'edit', 'git', 'build', 'browser', 'asset', 'dangerous'];
const DEFAULT_PERMISSIONS: Capability[] = ['read', 'edit', 'git', 'build'];
const HITL_KINDS = ['question', 'approval'];

export interface LoadedSpec {
  missions: Mission[];
  workflows: Map<string, Workflow>;
}

/**
 * Loads every YAML file in `.agent/workflows/`. A document with a
 * `missions` key is a mission file (requires document-level spec_version);
 * a document with `id` + `steps` is a reusable workflow definition.
 */
export function loadAgentSpec(agentDir: string): LoadedSpec {
  const wfDir = path.join(agentDir, 'workflows');
  if (!fs.existsSync(wfDir)) throw new Error(`no workflows directory at ${wfDir}`);
  const missions: Mission[] = [];
  const workflows = new Map<string, Workflow>();
  for (const f of fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) {
    const doc = parse(fs.readFileSync(path.join(wfDir, f), 'utf8')) as Record<string, unknown> | null;
    if (!doc) continue;
    if (Array.isArray(doc.missions)) {
      if (!doc.spec_version) throw new Error(`${f}: spec_version is required at document level`);
      missions.push(...(doc.missions as Mission[]));
    } else if (doc.id && Array.isArray(doc.steps)) {
      const wf = doc as unknown as Workflow;
      if (workflows.has(wf.id)) throw new Error(`${f}: duplicate workflow id ${wf.id}`);
      workflows.set(wf.id, wf);
    }
  }
  validateSpec(missions, workflows);
  return { missions, workflows };
}

export function validateSpec(missions: Mission[], workflows: Map<string, Workflow>): void {
  const errors: string[] = [];

  for (const wf of workflows.values()) {
    for (const cap of wf.capabilities ?? []) {
      if (!KNOWN_CAPABILITIES.includes(cap)) errors.push(`workflow ${wf.id}: unknown capability "${cap}"`);
    }
    const stepIds = new Set<string>();
    for (const step of wf.steps ?? []) {
      if (stepIds.has(step.id)) errors.push(`workflow ${wf.id}: duplicate step id "${step.id}"`);
      stepIds.add(step.id);
      if (step.hitl && !HITL_KINDS.includes(step.hitl)) {
        errors.push(`workflow ${wf.id} step ${step.id}: hitl must be "question" or "approval"`);
      }
    }
  }

  const missionIds = new Set<string>();
  for (const m of missions) {
    if (missionIds.has(m.id)) errors.push(`duplicate mission id "${m.id}"`);
    missionIds.add(m.id);
    const perms = m.permissions ?? DEFAULT_PERMISSIONS;
    for (const p of perms) {
      if (!KNOWN_CAPABILITIES.includes(p)) errors.push(`mission ${m.id}: unknown permission "${p}"`);
    }
    for (const mw of m.workflows ?? []) {
      const wf = mw.inline_workflow ?? (mw.workflow ? workflows.get(mw.workflow) : undefined);
      if (!wf) {
        errors.push(`mission ${m.id}: workflow "${mw.workflow ?? mw.id}" not found`);
        continue;
      }
      for (const cap of wf.capabilities ?? []) {
        if (cap === 'dangerous') {
          errors.push(`mission ${m.id}: workflow ${wf.id} requests "dangerous"; not allowed in v1`);
        } else if (!perms.includes(cap)) {
          errors.push(`mission ${m.id}: workflow ${wf.id} requests capability "${cap}" not granted by mission`);
        }
      }
    }
  }

  if (errors.length) {
    throw new Error('AgentSpec validation failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  }
}

export function resolveWorkflow(spec: LoadedSpec, mission: Mission, missionWorkflowId: string): Workflow {
  const mw = mission.workflows.find((w) => w.id === missionWorkflowId);
  if (!mw) throw new Error(`mission ${mission.id}: no mission workflow "${missionWorkflowId}"`);
  const wf = mw.inline_workflow ?? (mw.workflow ? spec.workflows.get(mw.workflow) : undefined);
  if (!wf) throw new Error(`mission ${mission.id}: workflow "${mw.workflow}" not found`);
  return wf;
}
