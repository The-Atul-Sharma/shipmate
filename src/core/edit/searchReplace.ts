/**
 * Search/replace edit blocks — the apply mechanism for AI fixes.
 *
 * Rather than have the model re-emit a whole file (expensive in output tokens,
 * slow, and wasteful when one line changes), we ask for one or more anchored
 * edit blocks:
 *
 *     <<<<<<< SEARCH
 *     <exact lines copied from the current file>
 *     =======
 *     <replacement lines>
 *     >>>>>>> REPLACE
 *
 * Each block is matched against the current file content and spliced in
 * deterministically here — no second model and no line numbers to drift.
 */

export interface EditBlock {
  search: string;
  replace: string;
}

export interface ApplyResult {
  /** The file content with every matched block applied. */
  content: string;
  /** Blocks whose SEARCH text wasn't found and were skipped. */
  failed: EditBlock[];
  /** How many blocks were successfully applied. */
  applied: number;
}

const SEARCH_START = /^<{5,}\s*SEARCH\s*$/;
const DIVIDER = /^={5,}\s*$/;
const REPLACE_END = /^>{5,}\s*REPLACE\s*$/;

/**
 * Parse SEARCH/REPLACE blocks out of raw model output. Parsing is line-based
 * (rather than one big regex) so block bodies containing `=` or `>` lines don't
 * trip the markers. Malformed/partial blocks are ignored.
 */
export function parseEditBlocks(raw: string): EditBlock[] {
  const blocks: EditBlock[] = [];
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (!SEARCH_START.test(lines[i])) {
      i++;
      continue;
    }
    i++; // consume the SEARCH marker
    const search: string[] = [];
    while (i < lines.length && !DIVIDER.test(lines[i])) {
      search.push(lines[i++]);
    }
    if (i >= lines.length) break; // no divider — malformed, stop
    i++; // consume the divider
    const replace: string[] = [];
    while (i < lines.length && !REPLACE_END.test(lines[i])) {
      replace.push(lines[i++]);
    }
    if (i >= lines.length) break; // no REPLACE marker — malformed, stop
    i++; // consume the REPLACE marker
    blocks.push({ search: search.join('\n'), replace: replace.join('\n') });
  }
  return blocks;
}

/**
 * Apply edit blocks to `source` in order, returning the merged content and any
 * blocks that couldn't be matched. Matching is exact on indentation but tolerant
 * of line endings: a model emits LF blocks, so we match in LF space and restore
 * the file's original convention (CRLF if it used it) on output. An empty SEARCH
 * appends the replacement, which lets the model add to a file. Each block
 * replaces only the first occurrence of its SEARCH text.
 */
export function applyEditBlocks(source: string, blocks: EditBlock[]): ApplyResult {
  // Files on Windows (or with mixed endings) arrive as CRLF; model blocks are
  // always LF. Match and splice in LF space, then convert back so we don't
  // silently rewrite every line ending in the file.
  const wasCRLF = /\r\n/.test(source);
  const norm = (s: string): string => s.replace(/\r\n/g, '\n');
  let content = norm(source);
  const failed: EditBlock[] = [];
  let applied = 0;
  for (const block of blocks) {
    const search = norm(block.search);
    const replace = norm(block.replace);
    if (search === '') {
      content += replace;
      applied++;
      continue;
    }
    const idx = content.indexOf(search);
    if (idx === -1) {
      failed.push(block);
      continue;
    }
    content = content.slice(0, idx) + replace + content.slice(idx + search.length);
    applied++;
  }
  if (wasCRLF) {
    content = content.replace(/\n/g, '\r\n');
  }
  return { content, failed, applied };
}
