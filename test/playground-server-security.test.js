import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlaygroundServer} from '../scripts/playground.mjs';

test('HTML aliases retain safe import-map data and resolve the same local assets', async t => {
  const root = mkdtempSync(join(tmpdir(), 'sansa-server-security-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const hostile = '</script><img src=x onerror=alert(1)>$&$\'$`';
  for (const [dir, pkg] of Object.entries({
    runtime: {name: '@altopelago/aeon-runtime', exports: './dist/index.js'},
    sdk: {name: '@altopelago/aeon-sdk', exports: {'.': './dist/index.js', './sansa': './dist/sansa.js'}},
    untrusted: {name: hostile, exports: './dist/index.js'},
  })) {
    const target = join(root, 'implementations/typescript/packages', dir);
    mkdirSync(target, {recursive: true});
    writeFileSync(join(target, 'package.json'), JSON.stringify(pkg));
  }
  const server = createPlaygroundServer({aeonRoot: root});
  const request = (url, method = 'GET') => new Promise(resolve => {
    let status, headers;
    server.emit('request', {url, method}, {
      writeHead(code, values) { status = code; headers = values; },
      end(body) { resolve({status, headers, body}); },
    });
  });
  for (const url of ['/', '/tools/playground/', '/tools/playground/index.html']) {
    const result = await request(url);
    assert.equal(result.status, 200);
    const html = result.body;
    assert.match(html, /<base href="\/tools\/playground\/">/);
    const begin = html.indexOf('<script type="importmap">') + '<script type="importmap">'.length;
    const end = html.indexOf('</script>', begin);
    const json = html.slice(begin, end);
    assert.equal(JSON.parse(json).imports[hostile], '/aeon/untrusted/index.js');
    assert.ok(!json.includes('<'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    const head = await request(url, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, undefined);
    for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|mjs|css))"/g)) {
      const path = new URL(asset, 'http://localhost/tools/playground/').pathname;
      assert.equal((await request(path)).status, 200, path);
    }
  }
  const arithmetic = await request('/tools/playground/arithmetic.html');
  assert.equal(arithmetic.status, 200);
  assert.match(arithmetic.headers['content-type'], /text\/html/);
  assert.match(arithmetic.body, /SANSA arithmetic playground/);
  assert.equal((await request('/tools/playground/arithmetic.html', 'HEAD')).body, undefined);
  for (const [, asset] of arithmetic.body.matchAll(/(?:src|href)="([^\"]+\.(?:js|mjs|css))"/g)) {
    const path = new URL(asset, 'http://localhost/tools/playground/').pathname;
    assert.equal((await request(path)).status, 200, path);
  }
  assert.equal((await request('/tools/playground/unknown.html')).status, 404);
});
