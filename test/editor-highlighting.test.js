import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseAddress} from '../src/index.js';

const context = vm.createContext({window: {}, document: {querySelectorAll: () => []}});
vm.runInContext(readFileSync(new URL('../tools/playground/aeon-highlight.js', import.meta.url), 'utf8'), context);
const highlight = context.window.AeonWebHighlight.highlightAeon;

test('source editor highlights declared IDs and embedded chained selectors while preserving text', () => {
  const source = String.raw`items = [ \item1\ = { name\name1\ = "Widget" } ]
chosen:sansa = $.items.\item1\.\name1\ `.trimEnd();
  const html = highlight(source);
  assert.equal((html.match(/class="tok-identity"/g) ?? []).length, 2);
  assert.ok(html.includes(String.raw`<span class="tok-sansa">$.items.\item1\.\name1\</span>`));
  assert.equal(html.replace(/<[^>]+>/g, '').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&'), source);
});

test('quoted identity-looking keys and strings remain lexical values, not identity steps', () => {
  const literal = String.raw`$.["\\item1\\"]`;
  const parsed = parseAddress(literal);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.address.isExact, true);
  const html = highlight(`chosen:sansa = ${literal}`);
  assert.ok(html.includes(`<span class="tok-sansa">${literal}</span>`));
  assert.doesNotMatch(html, /tok-identity/);
  assert.doesNotMatch(highlight(String.raw`text = "\\item1\\"`), /tok-identity/);
  assert.doesNotMatch(highlight(String.raw`// \item1\ `.trimEnd()), /tok-identity/);
});
