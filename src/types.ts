export type Capability = 'read' | 'edit' | 'git' | 'build' | 'browser' | 'asset' | 'dangerous';
export type HitlKind = 'question' | 'approval';

export interface ContextProfile {
  budget?: 'small' | 'medium' | 'large';
  strategy?: 'focused' | 'broad';
  required_sources?: string[];
  max_files?: number;
  max_tokens?: number;
}

export interface Trigger {
  type: 'manual' | 'github_label' | 'github_comment' | 'scheduled' | 'post_merge';
  label?: string;
  command?: string;
  cron?: string;
  branch?: string;
}

export interface WorkflowStep {
  id: string;
  task: string;
  description?: string;
  agent: string;
  prompt?: string;
  context?: ContextProfile;
  outputs?: string[];
  hitl?: HitlKind;
}

export interface Workflow {
  id: string;
  title: string;
  description?: string;
  capabilities: Capability[];
  steps: WorkflowStep[];
  version?: string;
}

export interface MissionWorkflow {
  id: string;
  workflow?: string;
  inline_workflow?: Workflow;
  triggers?: Trigger[];
  inputs?: Record<string, unknown>;
}

export interface Mission {
  id: string;
  title: string;
  description?: string;
  workflows: MissionWorkflow[];
  permissions?: Capability[];
  design_links?: string[];
}

export type RunState =
  | 'pending'
  | 'running'
  | 'waiting_for_human'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'completed';

export interface RunRecord {
  runId: string;
  mission: string;
  missionWorkflow: string;
  workflow: string;
  issue: number;
  state: RunState;
  currentStep?: string;
  stepIndex: number;
  answers: Record<string, string>;
  outputs: Record<string, unknown>;
  log: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  runId: string;
  stepId: string;
  issue: number;
  text: string;
  options: string[];
  state: 'open' | 'answered';
  answer?: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  runId: string;
  stepId: string;
  summary: string;
  state: 'pending' | 'approved' | 'rejected';
  feedback?: string;
  outputs?: Record<string, unknown>;
  createdAt: string;
}
