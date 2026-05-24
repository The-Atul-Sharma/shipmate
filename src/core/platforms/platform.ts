export interface PullRequest {
  number: number;
  title: string;
  author: string;
  authorAvatar?: string;
  branch: string;
  baseBranch: string;
  openedAt: string;
  ciStatus: 'success' | 'failure' | 'pending' | 'none';
  reviewStatus: 'approved' | 'changes_requested' | 'pending' | 'none';
  comments: number;
  isDraft: boolean;
  merged: boolean;
  url: string;
}

export interface ReviewComment {
  id: string;
  file: string;
  line: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

export type PRFilter = 'mine' | 'review-requested' | 'all-open' | 'drafts' | 'recently-merged';

export interface Platform {
  readonly kind: string;
  listPullRequests(filter: PRFilter): Promise<PullRequest[]>;
  getComments(prNumber: number): Promise<ReviewComment[]>;
  createPullRequest(title: string, body: string, head: string, base: string): Promise<PullRequest>;
  appendToDescription(prNumber: number, text: string): Promise<void>;
  /**
   * Insert or replace a marker-delimited section in the PR description. Re-posting
   * the same `sectionId` replaces the previous block instead of appending a copy.
   * Optional — callers fall back to appendToDescription when unavailable.
   */
  upsertDescriptionSection?(prNumber: number, sectionId: string, body: string): Promise<void>;
  /** Unified diff for a pull request (what changed vs the base branch). */
  getDiff(prNumber: number): Promise<string>;
  /** Post a single summary review comment to the PR. */
  postReview(prNumber: number, body: string): Promise<void>;
  /**
   * Delete a review comment by its id (as returned in `ReviewComment.id`).
   * Optional — platforms without delete support omit it and the UI hides the
   * delete action.
   */
  deleteComment?(prNumber: number, commentId: string): Promise<void>;
  /**
   * Post findings as inline review comments anchored to file/line, with a summary
   * comment for the rest. Returns how many landed inline vs. fell back to summary.
   * Optional — platforms without inline support post a summary via postReview.
   */
  postInlineReview?(
    prNumber: number,
    comments: InlineComment[],
    summary: string
  ): Promise<{ inline: number; summarized: number; duplicates: number }>;
  /**
   * The base (before) and head (after) contents of a file in a PR, for a true
   * side-by-side diff. Optional — platforms that can't provide it fall back to
   * the unified diff. Either side may be empty (added/deleted files).
   */
  getFileVersions?(prNumber: number, path: string): Promise<{ base: string; head: string }>;
}
