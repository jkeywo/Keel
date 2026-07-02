import { spawn } from 'node:child_process';

export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

export interface IssueComment {
  id: number;
  author: string;
  body: string;
}

export interface PullRequest {
  number: number;
  url: string;
}

export interface GitHubAdapter {
  readonly repo: string;
  getIssue(num: number): Promise<Issue>;
  listComments(num: number): Promise<IssueComment[]>;
  addComment(num: number, body: string): Promise<void>;
  addLabels(num: number, labels: string[]): Promise<void>;
  removeLabel(num: number, label: string): Promise<void>;
  createIssue(title: string, body: string, labels: string[]): Promise<number>;
  createPullRequest(title: string, body: string, head: string, base?: string): Promise<PullRequest>;
}

/** Real adapter: shells out to the authenticated `gh` CLI (Spec/04 §5.5). */
export class GhCliAdapter implements GitHubAdapter {
  constructor(readonly repo: string) {}

  private gh(args: string[], input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(out) : reject(new Error(`gh ${args.slice(0, 2).join(' ')} exited ${code}: ${err || out}`)),
      );
      if (input !== undefined) child.stdin.write(input);
      child.stdin.end();
    });
  }

  async getIssue(num: number): Promise<Issue> {
    const out = await this.gh(['api', `repos/${this.repo}/issues/${num}`]);
    const d = JSON.parse(out) as { number: number; title: string; body: string | null; labels: { name: string }[] };
    return { number: d.number, title: d.title, body: d.body ?? '', labels: (d.labels ?? []).map((l) => l.name) };
  }

  async listComments(num: number): Promise<IssueComment[]> {
    const out = await this.gh(['api', `repos/${this.repo}/issues/${num}/comments`, '--paginate']);
    const arr = JSON.parse(out) as { id: number; user?: { login?: string }; body?: string }[];
    return arr.map((c) => ({ id: c.id, author: c.user?.login ?? '', body: c.body ?? '' }));
  }

  async addComment(num: number, body: string): Promise<void> {
    await this.gh(
      ['api', `repos/${this.repo}/issues/${num}/comments`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ body }),
    );
  }

  async addLabels(num: number, labels: string[]): Promise<void> {
    await this.gh(
      ['api', `repos/${this.repo}/issues/${num}/labels`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ labels }),
    );
  }

  async removeLabel(num: number, label: string): Promise<void> {
    await this.gh([
      'api',
      `repos/${this.repo}/issues/${num}/labels/${encodeURIComponent(label)}`,
      '--method',
      'DELETE',
    ]);
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<number> {
    const out = await this.gh(
      ['api', `repos/${this.repo}/issues`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ title, body, labels }),
    );
    return (JSON.parse(out) as { number: number }).number;
  }

  async createPullRequest(title: string, body: string, head: string, base = 'main'): Promise<PullRequest> {
    const out = await this.gh(
      ['api', `repos/${this.repo}/pulls`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ title, body, head, base }),
    );
    const d = JSON.parse(out) as { number: number; html_url: string };
    return { number: d.number, url: d.html_url };
  }
}

/** In-memory adapter for tests and --dry-run. */
export class MockGitHub implements GitHubAdapter {
  readonly repo = 'mock/repo';
  readonly issues = new Map<number, Issue>();
  readonly comments = new Map<number, IssueComment[]>();
  readonly pullRequests: { number: number; title: string; body: string; head: string; base: string }[] = [];
  private nextIssue = 1;

  seedIssue(title: string, body: string, labels: string[] = []): number {
    const n = this.nextIssue++;
    this.issues.set(n, { number: n, title, body, labels: [...labels] });
    this.comments.set(n, []);
    return n;
  }

  async getIssue(num: number): Promise<Issue> {
    const i = this.issues.get(num);
    if (!i) throw new Error(`mock: no issue #${num}`);
    return i;
  }

  async listComments(num: number): Promise<IssueComment[]> {
    return this.comments.get(num) ?? [];
  }

  async addComment(num: number, body: string): Promise<void> {
    const list = this.comments.get(num) ?? [];
    list.push({ id: list.length + 1, author: 'mock-user', body });
    this.comments.set(num, list);
  }

  async addLabels(num: number, labels: string[]): Promise<void> {
    const i = await this.getIssue(num);
    for (const l of labels) if (!i.labels.includes(l)) i.labels.push(l);
  }

  async removeLabel(num: number, label: string): Promise<void> {
    const i = await this.getIssue(num);
    i.labels = i.labels.filter((x) => x !== label);
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<number> {
    return this.seedIssue(title, body, labels);
  }

  async createPullRequest(title: string, body: string, head: string, base = 'main'): Promise<PullRequest> {
    const number = 100 + this.pullRequests.length;
    this.pullRequests.push({ number, title, body, head, base });
    return { number, url: `https://github.com/${this.repo}/pull/${number}` };
  }
}
