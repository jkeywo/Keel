import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** Subset of Spec/05-ProjectSpec.md the runtime consumes. */
export interface ProjectSpec {
  language?: string | string[];
  build: string[];
  test: string[];
  scripts?: Record<string, string>;
}

export function loadProjectSpec(repoPath: string): ProjectSpec | null {
  for (const name of ['projectspec.yaml', 'projectspec.yml']) {
    const file = path.join(repoPath, name);
    if (!fs.existsSync(file)) continue;
    const doc = (parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>) ?? {};
    return {
      language: doc.language as ProjectSpec['language'],
      build: Array.isArray(doc.build) ? (doc.build as string[]) : [],
      test: Array.isArray(doc.test) ? (doc.test as string[]) : [],
      scripts: (doc.scripts as Record<string, string>) ?? undefined,
    };
  }
  return null;
}
