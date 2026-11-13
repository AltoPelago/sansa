import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const highlighter = new URL('../tools/playground/aeon-highlight.js', import.meta.url);
const context = vm.createContext({window: {}});
vm.runInContext(readFileSync(highlighter, 'utf8'), context);
const {highlightAeon, highlightJson} = context.window.AeonWebHighlight;

function onlyFormattingElements(html) {
  for (const [tag] of html.matchAll(/<[^>]*>/g)) {
    assert.match(tag, /^<(?:span class="[A-Za-z0-9 _-]+"|\/span)>$/);
  }
}

test('AEON text remains escaped through comments, diagnostics and inline formatting', () => {
  for (const payload of ['<img src=x onerror=alert(1)>', '</span><svg onload=alert(1)>',
    '&lt;script&gt;alert(1)&lt;/script&gt;', '" onmouseover="alert(1)']) {
    for (const source of [payload, 'value = "' + payload + '"', '//# &ND v1 ' + payload,
      '/#\n[@link|' + payload + ']\n#/', '`' + payload + '`']) {
      onlyFormattingElements(highlightAeon(source));
      for (const column of [1, 5, source.length + 10]) {
        onlyFormattingElements(highlightAeon(source, 1, column));
      }
    }
  }
});

test('JSON highlighting escapes text outside recognized tokens', () => {
  for (const source of ['<img src=x onerror=alert(1)>', '</span><script>alert(1)</script>',
    '{"key":"<svg onload=alert(1)>"}', '&lt;img&gt;']) {
    const html = highlightJson(source);
    onlyFormattingElements(html);
    assert.doesNotMatch(html, /<(?:img|svg|script)\b/i);
  }
});

test('many same-line comment and template tokens do not exhaust the stack', () => {
  for (const token of ['/**/ ', '`x` ']) {
    const html = highlightAeon(token.repeat(5000));
    onlyFormattingElements(html);
    assert.ok(html.length > 5000);
  }
});

test('an unterminated escaped-quote run is consumed once as display text', () => {
  for (const n of [256, 512]) {
    const source = '"' + '\\"'.repeat(n);
    assert.equal(highlightAeon(source), '<span class="tok-string">' + source + '</span>');
    assert.equal(highlightJson(source), source);
  }
});

test('unterminated escaped quotes complete within an isolated execution deadline', () => {
  const script = `import {readFileSync} from 'node:fs';
    import vm from 'node:vm';
    const context = vm.createContext({window:{}});
    vm.runInContext(readFileSync(process.argv[1], 'utf8'), context);
    for (const prefix of ['"', "'", '\x60', 'name = "', 'name = !"',
      'name = ~>["', 'name = ~>.@.["', 'name = ~["', 'name = ~.@.["']) {
      for (const n of [32, 64]) {
        const source = prefix + '\\\\!'.repeat(n);
        context.window.AeonWebHighlight.highlightAeon(source);
        context.window.AeonWebHighlight.highlightJson(source);
      }
    }
    process.stdout.write('completed');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script,
    fileURLToPath(highlighter)], {timeout: 3000, encoding: 'utf8'});
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'completed');
});
