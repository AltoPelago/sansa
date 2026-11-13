import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {rowsFromNamespace} from '../tools/playground/namespace.mjs';

const highlighter = new URL('../tools/playground/aeon-highlight.js', import.meta.url);
const context = vm.createContext({window: {}});
vm.runInContext(readFileSync(highlighter, 'utf8'), context);

test('inline documentation retains closed-token formatting and escapes', () => {
  const source = '//# [*bold] [/em] [$code] [@label|target] [x] | \\[';
  const expected = '<span class="tok-comment-doc">//# '
    + '<span class="tok-and-strong">[*bold]</span> '
    + '<span class="tok-and-emphasis">[/em]</span> '
    + '<span class="tok-and-code">[$code]</span> '
    + '<span class="tok-and-link">[@label</span>'
    + '<span class="tok-and-link-separator">|</span>'
    + '<span class="tok-and-link-target">target</span>'
    + '<span class="tok-and-link">]</span> '
    + '<span class="tok-and-invalid">[x]</span> '
    + '<span class="tok-and-table-pipe">|</span> '
    + '<span class="tok-and-escape">\\[</span></span>';
  assert.equal(context.window.AeonWebHighlight.highlightAeon(source), expected);
  const incomplete = context.window.AeonWebHighlight.highlightAeon('//# [* [@ | \\[ <img>');
  assert.ok(incomplete.includes('&lt;img&gt;'));
  assert.ok(incomplete.includes('tok-and-table-pipe'));
  assert.ok(incomplete.includes('tok-and-escape'));
});

test('repeated unterminated inline openers complete in an isolated bounded process', () => {
  const script = `import {readFileSync} from 'node:fs';
    import vm from 'node:vm';
    const context = vm.createContext({window:{}});
    vm.runInContext(readFileSync(process.argv[1], 'utf8'), context);
    for (const size of [100000, 200000]) {
      const html = context.window.AeonWebHighlight.highlightAeon('//# ' + '[*'.repeat(size));
      if (html.length < size * 2) throw new Error('truncated source text');
    }
    process.stdout.write('completed');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script,
    fileURLToPath(highlighter)], {timeout: 3000, encoding: 'utf8'});
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'completed');
});

test('wide namespace rows preserve original bindings, order and attribute placement', () => {
  const children = Array.from({length: 150000}, (_, index) => ({
    address: '$[' + index + ']', representationKind: 'StringLiteral', value: index,
  }));
  const attributeSpace = {address: '$.@', children: []};
  const root = {address: '$', children, attributeSpace};
  const rows = rowsFromNamespace({root});
  assert.equal(rows.length, children.length + 2);
  assert.equal(rows[0].binding, root);
  assert.equal(rows[1].binding, children[0]);
  assert.equal(rows[children.length].binding, children.at(-1));
  assert.equal(rows.at(-1).binding, attributeSpace);
  assert.equal(children[0].address, '$[0]');
});

test('iterable namespace children retain depth-first traversal order', () => {
  const first = {address: '$.first', children: [{address: '$.first.leaf'}]};
  const last = {address: '$.last'};
  const root = {address: '$', children: new Set([first, last])};
  assert.deepEqual(rowsFromNamespace({root}).map(row => row.path),
    ['$', '$.first', '$.first.leaf', '$.last']);
});
