import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEditBlocks, applyEditBlocks } from '../src/core/edit/searchReplace.ts';

const block = (search: string, replace: string): string =>
  `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;

test('parses a single block', () => {
  const blocks = parseEditBlocks(block('old line', 'new line'));
  assert.deepEqual(blocks, [{ search: 'old line', replace: 'new line' }]);
});

test('parses multiple blocks and ignores surrounding prose', () => {
  const raw = `Here is the fix:\n${block('a', 'b')}\nand another\n${block('c', 'd')}\ndone`;
  assert.deepEqual(parseEditBlocks(raw), [
    { search: 'a', replace: 'b' },
    { search: 'c', replace: 'd' }
  ]);
});

test('block bodies may contain = and > lines', () => {
  const blocks = parseEditBlocks(block('x = 1\nif (a > b) {}', 'x = 2'));
  assert.equal(blocks[0].search, 'x = 1\nif (a > b) {}');
});

test('ignores a malformed block with no divider', () => {
  assert.deepEqual(parseEditBlocks('<<<<<<< SEARCH\nfoo\n>>>>>>> REPLACE'), []);
});

test('returns no blocks for plain text', () => {
  assert.deepEqual(parseEditBlocks('just a normal model reply'), []);
});

test('applies a block to source', () => {
  const src = 'line1\nline2\nline3\n';
  const res = applyEditBlocks(src, [{ search: 'line2', replace: 'LINE2' }]);
  assert.equal(res.content, 'line1\nLINE2\nline3\n');
  assert.equal(res.applied, 1);
  assert.equal(res.failed.length, 0);
});

test('reports unmatched blocks instead of applying them', () => {
  const res = applyEditBlocks('hello\n', [{ search: 'goodbye', replace: 'x' }]);
  assert.equal(res.content, 'hello\n');
  assert.equal(res.applied, 0);
  assert.deepEqual(res.failed, [{ search: 'goodbye', replace: 'x' }]);
});

test('empty SEARCH appends the replacement', () => {
  const res = applyEditBlocks('a\n', [{ search: '', replace: 'b\n' }]);
  assert.equal(res.content, 'a\nb\n');
  assert.equal(res.applied, 1);
});

test('replaces only the first occurrence', () => {
  const res = applyEditBlocks('dup\ndup\n', [{ search: 'dup', replace: 'X' }]);
  assert.equal(res.content, 'X\ndup\n');
});

test('applies blocks sequentially so later blocks see earlier edits', () => {
  const res = applyEditBlocks('a\nb\n', [
    { search: 'a', replace: 'A' },
    { search: 'b', replace: 'B' }
  ]);
  assert.equal(res.content, 'A\nB\n');
  assert.equal(res.applied, 2);
});

test('matches an LF block against a CRLF file and preserves CRLF on output', () => {
  const src = 'one\r\ntwo\r\nthree\r\n';
  const res = applyEditBlocks(src, [{ search: 'two', replace: 'TWO' }]);
  assert.equal(res.content, 'one\r\nTWO\r\nthree\r\n');
  assert.equal(res.applied, 1);
});

test('matches a multi-line LF block against a CRLF file', () => {
  const src = 'a\r\nb\r\nc\r\n';
  const res = applyEditBlocks(src, [{ search: 'a\nb', replace: 'X\nY' }]);
  assert.equal(res.content, 'X\r\nY\r\nc\r\n');
});

test('end-to-end: parse then apply', () => {
  const src = 'function f() {\n  return 1;\n}\n';
  const raw = block('  return 1;', '  return 2;');
  const res = applyEditBlocks(src, parseEditBlocks(raw));
  assert.equal(res.content, 'function f() {\n  return 2;\n}\n');
});
