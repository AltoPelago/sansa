#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(readArg('--port') ?? process.env.PORT ?? 4173);
const host = readArg('--host') ?? '127.0.0.1';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  const requestedPath = url.pathname === '/' ? '/tools/query-web/index.html' : url.pathname;
  let filePath = resolve(root, `.${normalize(requestedPath)}`);

  if (!filePath.startsWith(`${root}${sep}`) && filePath !== root) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': contentType(filePath) });
  createReadStream(filePath)
    .on('error', (error) => {
      response.destroy(error);
    })
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`SANSA Query Workbench: http://${host}:${port}/tools/query-web/`);
});

server.on('error', (error) => {
  console.error(`SANSA Query Workbench failed to start on ${host}:${port}: ${error.message}`);
  process.exit(1);
});

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
