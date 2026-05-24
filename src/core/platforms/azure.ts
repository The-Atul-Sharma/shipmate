import * as azdev from 'azure-devops-node-api';
import { Platform, PRFilter, PullRequest, ReviewComment } from './platform';

export class AzurePlatform implements Platform {
  readonly kind = 'azure';
  private connection: azdev.WebApi;

  constructor(
    token: string,
    orgUrl: string,
    private project: string,
    private repoId: string
  ) {
    this.connection = new azdev.WebApi(
      orgUrl,
      azdev.getPersonalAccessTokenHandler(token)
    );
  }

  async listPullRequests(filter: PRFilter): Promise<PullRequest[]> {
    const git = await this.connection.getGitApi();
    const prs = await git.getPullRequests(this.repoId, {
      status: filter === 'recently-merged' ? 3 : 1
    } as any);
    return prs.map((pr) => this.map(pr));
  }

  async getComments(prNumber: number): Promise<ReviewComment[]> {
    const git = await this.connection.getGitApi();
    const threads = await git.getThreads(this.repoId, prNumber, this.project);
    const out: ReviewComment[] = [];
    for (const thread of threads) {
      for (const c of thread.comments ?? []) {
        out.push({
          id: String(c.id),
          file: thread.threadContext?.filePath ?? '',
          line: thread.threadContext?.rightFileStart?.line ?? 0,
          author: c.author?.displayName ?? 'unknown',
          body: c.content ?? '',
          createdAt: c.publishedDate?.toISOString() ?? ''
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
    const git = await this.connection.getGitApi();
    const pr = await git.createPullRequest(
      {
        title,
        description: body,
        sourceRefName: `refs/heads/${head}`,
        targetRefName: `refs/heads/${base}`
      },
      this.repoId,
      this.project
    );
    return this.map(pr);
  }

  async appendToDescription(prNumber: number, text: string): Promise<void> {
    const git = await this.connection.getGitApi();
    const pr = await git.getPullRequestById(prNumber);
    await git.updatePullRequest(
      { description: `${pr.description ?? ''}\n\n${text}` },
      this.repoId,
      prNumber,
      this.project
    );
  }

  async getDiff(_prNumber: number): Promise<string> {
    throw new Error('Azure DevOps PR diff fetch is not supported yet.');
  }

  async postReview(prNumber: number, body: string): Promise<void> {
    const git = await this.connection.getGitApi();
    await git.createThread(
      { comments: [{ content: body, commentType: 1 }], status: 1 },
      this.repoId,
      prNumber,
      this.project
    );
  }

  private map(pr: any): PullRequest {
    return {
      number: pr.pullRequestId,
      title: pr.title ?? '',
      author: pr.createdBy?.displayName ?? 'unknown',
      branch: (pr.sourceRefName ?? '').replace('refs/heads/', ''),
      baseBranch: (pr.targetRefName ?? '').replace('refs/heads/', ''),
      openedAt: pr.creationDate?.toISOString?.() ?? '',
      ciStatus: 'none',
      reviewStatus: 'none',
      comments: 0,
      isDraft: !!pr.isDraft,
      merged: pr.status === 3,
      url: pr.url ?? ''
    };
  }
}
