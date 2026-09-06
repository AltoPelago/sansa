#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateQueryForWorkbench, parseQueryForWorkbench } from '../tools/query-web/runtime.mjs';
import { runMutationForWorkbench } from '../tools/mutate-web/runtime.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(readArg('--port') ?? process.env.PORT ?? 4173);
const host = readArg('--host') ?? '127.0.0.1';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  if (url.pathname === '/api/query') {
    handleQueryApi(request, response);
    return;
  }
  if (url.pathname === '/api/mutate') {
    handleMutateApi(request, response);
    return;
  }

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
  console.log(`SANSA Mutate Workbench: http://${host}:${port}/tools/mutate-web/`);
});

server.on('error', (error) => {
  console.error(`SANSA Query Workbench failed to start on ${host}:${port}: ${error.message}`);
  process.exit(1);
});

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function handleMutateApi(request, response) {
  if (request.method !== 'POST') {
    writeJson(response, 405, {
      ok: false,
      errors: [{ code: 'SANSA_MUTATE_WORKBENCH_METHOD_NOT_ALLOWED', message: 'Expected POST.' }],
    });
    return;
  }

  readRequestBody(request, 1_000_000)
    .then(async (body) => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        writeJson(response, 400, {
          ok: false,
          errors: [{ code: 'SANSA_MUTATE_WORKBENCH_INVALID_REQUEST_JSON', message: error.message }],
        });
        return;
      }

      const result = await runMutationForWorkbench({
        source: String(payload.source ?? ''),
        requestSource: String(payload.requestSource ?? ''),
        requestKind: payload.requestKind === 'instruction' ? 'instruction' : 'structured',
        mode: payload.mode === 'apply' ? 'apply' : 'plan',
        options: payload.options,
      });
      writeJson(response, result.ok ? 200 : 400, result);
    })
    .catch((error) => {
      writeJson(response, 400, {
        ok: false,
        errors: [{ code: 'SANSA_MUTATE_WORKBENCH_REQUEST_ERROR', message: error.message }],
      });
    });
}

function handleQueryApi(request, response) {
  if (request.method !== 'POST') {
    writeJson(response, 405, {
      ok: false,
      errors: [{ code: 'SANSA_QUERY_WORKBENCH_METHOD_NOT_ALLOWED', message: 'Expected POST.' }],
    });
    return;
  }

  readRequestBody(request, 1_000_000)
    .then(async (body) => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        writeJson(response, 400, {
          ok: false,
          errors: [{ code: 'SANSA_QUERY_WORKBENCH_INVALID_REQUEST_JSON', message: error.message }],
        });
        return;
      }

      const action = payload.action === 'parse' ? 'parse' : 'evaluate';
      const result = action === 'parse'
        ? parseQueryForWorkbench(String(payload.query ?? ''))
        : await evaluateQueryForWorkbench({
          sourceKind: ['json', 'telex'].includes(payload.sourceKind) ? payload.sourceKind : 'aeon',
          source: String(payload.source ?? ''),
          query: String(payload.query ?? ''),
          paramsSource: String(payload.paramsSource ?? ''),
          policy: payload.policy === 'validation' ? 'validation' : '',
          transformExtensions: payload.transformExtensions !== false,
          valueSemantics: parseValueSemantics(payload.valueSemantics),
          budget: payload.budget,
        });
      writeJson(response, result.ok ? 200 : 400, result);
    })
    .catch((error) => {
      writeJson(response, 400, {
        ok: false,
        errors: [{ code: 'SANSA_QUERY_WORKBENCH_REQUEST_ERROR', message: error.message }],
      });
    });
}

function parseValueSemantics(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  if (text.length === 0) return '';
  if (text.length > 100 || /\s/.test(text)) {
    throw new Error('valueSemantics expects a compact profile id or locale tag.');
  }
  return text;
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        request.destroy();
        rejectBody(new Error(`Request body exceeds ${maxBytes} bytes.`));
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
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
