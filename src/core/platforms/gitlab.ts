import { Gitlab } from '@gitbeaker/rest';
import { Platform, PRFilter, PullRequest, ReviewComment } from './platform';

export class GitLabPlatform implements Platform {
  readonly kind = 'gitlab';
  private api: InstanceType<typeof Gitlab>;

  constructor(
    token: string,
    private projectId: string | number
  ) {
    this.api = new Gitlab({ token });
  }

  async listPullRequests(filter: PRFilter): Promise<PullRequest[]> {
    const state = filter === 'recently-merged' ? 'merged' : 'opened';
    const mrs = await this.api.MergeRequests.all({
      projectId: this.projectId,
      state: state as any,
      perPage: 50
    });
    return (mrs as any[]).map((mr) => this.map(mr));
  }

  async getComments(prNumber: number): Promise<ReviewComment[]> {
    const notes = await this.api.MergeRequestDiscussions.all(this.projectId, prNumber);
    const out: ReviewComment[] = [];
    for (const disc of notes as any[]) {
      for (const note of disc.notes ?? []) {
        out.push({
          id: String(note.id),
          file: note.position?.new_path ?? '',
          line: note.position?.new_line ?? 0,
          author: note.author?.username ?? 'unknown',
          body: note.body,
          createdAt: note.created_at
        });
      }
    }
    return out;
  }

  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<PullRequest> {
    const mr = await this.api.MergeRequests.create(this.projectId, head, base, title, {
      description: body
    });
    return this.map(mr);
  }

  async appendToDescription(prNumber: number, text: string): Promise<void> {
    const mr: any = await this.api.MergeRequests.show(this.projectId, prNumber);
    await this.api.MergeRequests.edit(this.projectId, prNumber, {
      description: `${mr.description ?? ''}\n\n${text}`
    });
  }

  async getDiff(prNumber: number): Promise<string> {
    const diffs: any[] = (await (this.api.MergeRequests as any).allDiffs(this.projectId, prNumber)) ?? [];
    return diffs
      .map((d) => `diff --git a/${d.old_path} b/${d.new_path}\n${d.diff ?? ''}`)
      .join('\n');
  }

  async postReview(prNumber: number, body: string): Promise<void> {
    await (this.api.MergeRequestNotes as any).create(this.projectId, prNumber, body);
  }

  private map(mr: any): PullRequest {
    return {
      number: mr.iid,
      title: mr.title,
      author: mr.author?.username ?? 'unknown',
      authorAvatar: mr.author?.avatar_url,
      branch: mr.source_branch,
      baseBranch: mr.target_branch,
      openedAt: mr.created_at,
      ciStatus: 'none',
      reviewStatus: 'none',
      comments: mr.user_notes_count ?? 0,
      isDraft: !!mr.draft,
      merged: mr.state === 'merged',
      url: mr.web_url
    };
  }
}
