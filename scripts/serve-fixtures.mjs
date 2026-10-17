// Serves fixtures/ on localhost for manual testing of the extension.
// Dependency-free on purpose; this is a development aid, not part of the build.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const port = Number(process.env.PORT ?? 4321);
const types = { '.html': 'text/html; charset=utf-8' };

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = normalize(
    join(root, pathname === '/' ? 'basic-application.html' : pathname),
  );

  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const body = await readFile(file);
    response
      .writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
      })
      .end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Fixtures: http://127.0.0.1:${port}/basic-application.html`);
});
