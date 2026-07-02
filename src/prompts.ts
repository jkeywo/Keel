import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export interface PromptFile {
  id: string;
  description: string;
  inputs: string[];
  body: string;
  frontmatter: Record<string, unknown>;
}

export function parsePrompt(raw: string, filename: string): PromptFile {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${filename}: missing YAML frontmatter`);
  const fm = (parse(m[1]) as Record<string, unknown>) ?? {};
  if (typeof fm.id !== 'string') throw new Error(`${filename}: frontmatter "id" is required`);
  if (typeof fm.description !== 'string') throw new Error(`${filename}: frontmatter "description" is required`);
  return {
    id: fm.id,
    description: fm.description,
    inputs: Array.isArray(fm.inputs) ? (fm.inputs as string[]) : [],
    body: m[2],
    frontmatter: fm,
  };
}

/** Fill {{placeholders}}; every placeholder must be declared and supplied. */
export function fillPrompt(p: PromptFile, values: Record<string, string>): string {
  return p.body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!p.inputs.includes(name)) {
      throw new Error(`prompt ${p.id}: placeholder "${name}" not declared in inputs`);
    }
    const v = values[name];
    if (v === undefined) throw new Error(`prompt ${p.id}: missing value for input "${name}"`);
    return v;
  });
}

export class PromptLibrary {
  private prompts = new Map<string, PromptFile>();

  constructor(prompts: PromptFile[] = []) {
    for (const p of prompts) this.prompts.set(p.id, p);
  }

  static load(dir: string): PromptLibrary {
    const lib = new PromptLibrary();
    if (!fs.existsSync(dir)) return lib;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.prompt'))) {
      const p = parsePrompt(fs.readFileSync(path.join(dir, f), 'utf8'), f);
      if (lib.prompts.has(p.id)) throw new Error(`duplicate prompt id "${p.id}" (${f})`);
      lib.prompts.set(p.id, p);
    }
    return lib;
  }

  get(id: string): PromptFile {
    const p = this.prompts.get(id);
    if (!p) throw new Error(`prompt "${id}" not found in library`);
    return p;
  }
}
