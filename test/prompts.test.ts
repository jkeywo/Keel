import { describe, expect, it } from 'vitest';
import { fillPrompt, parsePrompt } from '../src/prompts.js';

const raw = `---
id: test-prompt
description: A test prompt.
inputs:
  - issue_description
---

Feature:

{{issue_description}}
`;

describe('prompt library', () => {
  it('parses frontmatter and body', () => {
    const p = parsePrompt(raw, 'test-prompt.md');
    expect(p.id).toBe('test-prompt');
    expect(p.inputs).toEqual(['issue_description']);
    expect(p.body).toContain('{{issue_description}}');
  });

  it('rejects files without frontmatter', () => {
    expect(() => parsePrompt('no frontmatter here', 'bad.md')).toThrow(/frontmatter/);
  });

  it('fills declared placeholders', () => {
    const p = parsePrompt(raw, 'test-prompt.md');
    expect(fillPrompt(p, { issue_description: 'Add filters' })).toContain('Add filters');
  });

  it('errors on undeclared placeholders', () => {
    const p = parsePrompt(raw.replace('{{issue_description}}', '{{surprise}}'), 'test-prompt.md');
    expect(() => fillPrompt(p, { issue_description: 'x' })).toThrow(/not declared/);
  });

  it('errors on missing input values', () => {
    const p = parsePrompt(raw, 'test-prompt.md');
    expect(() => fillPrompt(p, {})).toThrow(/missing value/);
  });
});
