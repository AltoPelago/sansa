#!/usr/bin/env node
import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {basename, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));

export function findAeonRoot(explicit) {
  const candidates = explicit ? [resolve(explicit)] : [
    resolve(repo, '../../aeon', basename(repo)), resolve(repo, '../aeon'),
  ];
  const found = candidates.find(p => existsSync(resolve(p, 'implementations/typescript/packages/sdk/dist/sansa.js')));
  if (!found) throw new Error('A built AEON checkout is required. Run npm run playground -- --aeon-root /path/to/aeon (build its TypeScript packages first).');
  return found;
}

export function playgroundImports(aeonRoot) {
  const packages = resolve(aeonRoot, 'implementations/typescript/packages');
  const imports = {'@altopelago/sansa': '/src/index.js',
    '@altopelago/sansa/parsing/selector-cursor': '/src/selector-cursor.js'};
  for (const dir of readdirSync(packages, {withFileTypes: true}).filter(d => d.isDirectory())) {
    const root = resolve(packages, dir.name);
    if (!existsSync(resolve(root, 'package.json'))) continue;
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const rootExport = pkg.exports?.['.'] ?? pkg.exports;
    const main = typeof rootExport === 'string' ? rootExport
      : rootExport?.import ?? rootExport?.default ?? pkg.module ?? pkg.main ?? './dist/index.js';
    if (typeof main !== 'string' || !main.startsWith('./dist/')) continue;
    imports[pkg.name] = `/aeon/${dir.name}/${main.slice(7)}`;
    // SDK subpaths and any other explicit browser-compatible public entry points.
    for (const [key, value] of Object.entries(pkg.exports ?? {})) {
      const entry = typeof value === 'string' ? value : value?.import;
      if (key.startsWith('./') && typeof entry === 'string' && entry.startsWith('./dist/')) {
        imports[pkg.name + key.slice(1)] = `/aeon/${dir.name}/${entry.slice(7)}`;
      }
    }
  }
  imports['@aeon/runtime'] = imports['@altopelago/aeon-runtime'];
  if (!imports['@aeon/runtime'] || !imports['@altopelago/aeon-sdk/sansa']) {
    throw new Error('AEON runtime and SDK browser entry points are missing from the selected checkout.');
  }
  return {imports};
}

export function createPlaygroundServer({aeonRoot}) {
  const imports = JSON.stringify(playgroundImports(aeonRoot)).replaceAll('<', '\\u003c');
  const packages = resolve(aeonRoot, 'implementations/typescript/packages');
  return createServer(async (request, response) => {
    const reply = (status, text) => {
      response.writeHead(status, {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'});
      response.end(text);
    };
    if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'Use GET or HEAD.');
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let root, relative;
      if (pathname === '/' || pathname === '/tools/playground/' || pathname === '/tools/playground/index.html') {
        const html = (await readFile(resolve(repo, 'tools/playground/index.html'), 'utf8'))
          .replace('__PLAYGROUND_IMPORTS__', imports);
        response.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
        return response.end(request.method === 'HEAD' ? undefined : html);
      }
      if (pathname.startsWith('/src/')) {
        root = resolve(repo, 'src'); relative = pathname.slice(5);
      } else if (pathname.startsWith('/tools/playground/')) {
        root = resolve(repo, 'tools/playground'); relative = pathname.slice('/tools/playground/'.length);
      } else if (pathname.startsWith('/aeon/')) {
        const match = /^\/aeon\/([a-z0-9-]+)\/(.+)$/.exec(pathname);
        if (!match) return reply(404, 'Not found.');
        root = resolve(packages, match[1], 'dist'); relative = match[2];
      } else return reply(404, 'Not found.');
      const file = await realpath(resolve(root, relative));
      const allowedRoot = await realpath(root);
      if (!file.startsWith(allowedRoot + sep) || !(await stat(file)).isFile()) return reply(403, 'Forbidden.');
      const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
      const type = types[extname(file)];
      if (!type) return reply(404, 'Not found.');
      const body = await readFile(file);
      response.writeHead(200, {'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      reply(error instanceof URIError ? 400 : 404, 'Not found.');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  try {
    const aeonRoot = findAeonRoot(arg('--aeon-root') ?? process.env.SANSA_PLAYGROUND_AEON_ROOT);
    const port = Number(arg('--port') ?? 4174);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
    const server = createPlaygroundServer({aeonRoot});
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
      console.log(`SANSA source playground: http://127.0.0.1:${server.address().port}/tools/playground/`);
      console.log(`SANSA: ${resolve(repo, 'src/index.js')}\nAEON: ${aeonRoot}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
