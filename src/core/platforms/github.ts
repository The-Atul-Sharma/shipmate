import { Octokit } from '@octokit/rest';
import { InlineComment, Platform, PRFilter, PullRequest, ReviewComment } from './platform';

function isPermissionError(err: any): boolean {
  return err?.status === 403 || /not accessible/i.test(err?.message ?? '');
}

const PERMISSION_MESSAGE =
  'Your GitHub token lacks permission to comment on this repo. Use a classic token with the "repo" scope, ' +
  'or a fine-grained token with "Pull requests: Read and write" access to this repository.';

export class GitHubPlatform implements Platform {
  readonly kind = 'github';
  private octokit: Octokit;

  constructor(
    token: string,
    private owner: string,
    private repo: string
  ) {
    this.octokit = new Octokit({ auth: token });
  }

  async listPullRequests(filter: PRFilter): Promise<PullRequest[]> {
    const state = filter === 'recently-merged' ? 'closed' : 'open';
    const { data } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state,
      per_page: 50
    });

    let prs = data.map((pr) => this.map(pr));
    if (filter === 'drafts') {
      prs = prs.filter((p) => p.isDraft);
    }
    if (filter === 'recently-merged') {
      prs = prs.filter((p) => p.merged);
    }
    // The list endpoint omits comment counts, so the badge always read 0. Fetch
    // the real issue + review comment totals for each PR in parallel.
    await Promise.all(
      prs.map(async (pr) => {
        try {
          const { data: full } = await this.octokit.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: pr.number
          });
          pr.comments = (full.comments ?? 0) + (full.review_comments ?? 0);
        } catch {
          /* leave count as-is on failure */
        }
      })
    );
    return prs;
  }

  async getComments(prNumber: number): Promise<ReviewComment[]> {
    const { data } = await this.octokit.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    return data.map((c) => ({
      id: String(c.id),
      file: c.path,
      line: c.line ?? c.original_line ?? 0,
      author: c.user?.login ?? 'unknown',
      body: c.body,
      createdAt: c.created_at
    }));
  }

  async deleteComment(_prNumber: number, commentId: string): Promise<void> {
    await this.octokit.pulls.deleteReviewComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: Number(commentId)
    });
  }

  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head,
      base
    });
    return this.map(data);
  }

  async appendToDescription(prNumber: number, text: string): Promise<void> {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    await this.octokit.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body: `${data.body ?? ''}\n\n${text}`
    });
  }

  async upsertDescriptionSection(prNumber: number, sectionId: string, body: string): Promise<void> {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    const current = data.body ?? '';
    const start = `<!-- shipmate:${sectionId}:start -->`;
    const end = `<!-- shipmate:${sectionId}:end -->`;
    const block = `${start}\n${body}\n${end}`;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escape(start)}[\\s\\S]*?${escape(end)}`);
    const next = re.test(current)
      ? current.replace(re, block)
      : `${current}${current.trim() ? '\n\n' : ''}${block}`;
    await this.octokit.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body: next
    });
  }

  async getDiff(prNumber: number): Promise<string> {
    const res = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      mediaType: { format: 'diff' }
    });
    // With the diff media type, Octokit returns the raw diff as the body.
    return res.data as unknown as string;
  }

  async postReview(prNumber: number, body: string, opts?: { dedupe?: boolean }): Promise<void> {
    try {
      if (opts?.dedupe) {
        // Skip if an identical summary comment is already on the PR.
        const existing = await this.octokit.paginate(this.octokit.issues.listComments, {
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          per_page: 100
        });
        if (existing.some((c) => (c.body ?? '').trim() === body.trim())) {
          return;
        }
      }
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body
      });
    } catch (err: any) {
      // A 403 here almost always means the token can't write comments. Translate
      // GitHub's opaque "Resource not accessible" into actionable guidance.
      if (isPermissionError(err)) {
        throw new Error(PERMISSION_MESSAGE);
      }
      throw err;
    }
  }

  async postInlineReview(
    prNumber: number,
    comments: InlineComment[],
    summary: string
  ): Promise<{ inline: number; summarized: number; duplicates: number }> {
    // Anchor each comment to the PR's head commit on the right-hand (new) side.
    const { data: pr } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    const commit_id = pr.head.sha;

    // Existing review comments, so re-posting doesn't duplicate them.
    const existing = await this.octokit.paginate(this.octokit.pulls.listReviewComments, {
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      per_page: 100
    });
    const seen = new Set(
      existing.map((c) => `${c.path}:${c.line ?? c.original_line}:${(c.body ?? '').trim()}`)
    );

    let inline = 0;
    let duplicates = 0;
    const overflow: InlineComment[] = [];
    for (const c of comments) {
      if (!c.path || !c.line || c.line < 1) {
        overflow.push(c);
        continue;
      }
      if (seen.has(`${c.path}:${c.line}:${c.body.trim()}`)) {
        duplicates++;
        continue;
      }
      try {
        await this.octokit.pulls.createReviewComment({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          commit_id,
          path: c.path,
          line: c.line,
          side: 'RIGHT',
          body: c.body
        });
        seen.add(`${c.path}:${c.line}:${c.body.trim()}`);
        inline++;
      } catch (err: any) {
        // No point retrying the rest if the token simply can't comment.
        if (isPermissionError(err)) {
          throw new Error(PERMISSION_MESSAGE);
        }
        // The line probably isn't part of the diff — fall back to the summary.
        overflow.push(c);
      }
    }

    // Summarise the overall review plus any findings that couldn't be inlined.
    const overflowMd = overflow.length
      ? `\n\n**Findings not on changed lines:**\n${overflow
          .map((c) => `- \`${c.path}:${c.line}\` — ${c.body.replace(/\n+/g, ' ')}`)
          .join('\n')}`
      : '';
    const summaryBody = `${summary}${overflowMd}`;
    if (summaryBody.trim()) {
      await this.postReview(prNumber, summaryBody, { dedupe: true });
    }
    return { inline, summarized: overflow.length, duplicates };
  }

  async getFileVersions(prNumber: number, path: string): Promise<{ base: string; head: string }> {
    const { data: pr } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });
    const [base, head] = await Promise.all([
      this.fileAt(path, pr.base.sha),
      this.fileAt(path, pr.head.sha)
    ]);
    return { base, head };
  }

  /** Raw file contents at a commit, or '' if the file doesn't exist there. */
  private async fileAt(path: string, ref: string): Promise<string> {
    try {
      const res = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
        mediaType: { format: 'raw' }
      });
      return res.data as unknown as string;
    } catch {
      return '';
    }
  }

  private map(pr: any): PullRequest {
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      authorAvatar: pr.user?.avatar_url,
      branch: pr.head?.ref ?? '',
      baseBranch: pr.base?.ref ?? 'main',
      openedAt: pr.created_at,
      ciStatus: 'none',
      reviewStatus: 'none',
      comments: pr.comments ?? 0,
      isDraft: !!pr.draft,
      merged: !!pr.merged_at,
      url: pr.html_url
    };
  }
}
