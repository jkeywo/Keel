import { describe, expect, it } from 'vitest';
import { validateSpec } from '../src/agentspec.js';
import type { Mission, Workflow } from '../src/types.js';

const workflow = (over: Partial<Workflow> = {}): Workflow => ({
  id: 'feature-prd',
  title: 'Feature PRD',
  capabilities: ['read', 'git'],
  steps: [
    { id: 'grill', task: 'grill', agent: 'prd-interviewer', hitl: 'question' },
    { id: 'prd', task: 'write_prd', agent: 'prd-writer', hitl: 'approval' },
  ],
  ...over,
});

const mission = (over: Partial<Mission> = {}): Mission => ({
  id: 'm1',
  title: 'Mission 1',
  permissions: ['read', 'edit', 'git'],
  workflows: [{ id: 'w1', workflow: 'feature-prd' }],
  ...over,
});

describe('AgentSpec validation', () => {
  it('accepts a well-formed spec', () => {
    expect(() => validateSpec([mission()], new Map([['feature-prd', workflow()]]))).not.toThrow();
  });

  it('rejects invalid hitl values', () => {
    const wf = workflow({ steps: [{ id: 's', task: 'grill', agent: 'a', hitl: 'true' as never }] });
    expect(() => validateSpec([mission()], new Map([['feature-prd', wf]]))).toThrow(/hitl must be/);
  });

  it('rejects workflow capabilities not granted by the mission', () => {
    const wf = workflow({ capabilities: ['read', 'build'] });
    expect(() => validateSpec([mission()], new Map([['feature-prd', wf]]))).toThrow(/not granted by mission/);
  });

  it('rejects the dangerous capability outright', () => {
    const wf = workflow({ capabilities: ['dangerous'] });
    const m = mission({ permissions: ['dangerous'] });
    expect(() => validateSpec([m], new Map([['feature-prd', wf]]))).toThrow(/dangerous/);
  });

  it('rejects missing workflow references', () => {
    expect(() => validateSpec([mission()], new Map())).toThrow(/not found/);
  });

  it('rejects duplicate step ids', () => {
    const wf = workflow({
      steps: [
        { id: 'x', task: 'grill', agent: 'a' },
        { id: 'x', task: 'write_prd', agent: 'b' },
      ],
    });
    expect(() => validateSpec([mission()], new Map([['feature-prd', wf]]))).toThrow(/duplicate step id/);
  });
});
