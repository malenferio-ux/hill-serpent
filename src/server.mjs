import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { handle } from './worker.mjs';
import { duelEngine } from './duel-node.mjs';

export function createServer(env = process.env) {
  // One Node process, no worker threads and no subprocesses in /move.
  const settings = { ...env, SEARCH_NODES: env.SEARCH_NODES || '3200', DUEL_SEARCH_NODES: env.DUEL_SEARCH_NODES || '40000', DUEL_WORK_BUDGET: env.DUEL_WORK_BUDGET || '12000000', JS_DUEL_SEARCH_NODES: env.JS_DUEL_SEARCH_NODES || '6400' };
  return http.createServer(async (req, res) => {
    try {
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 131072) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method, headers: req.headers,
        ...((req.method !== 'GET' && req.method !== 'HEAD') ? { body } : {}),
      });
      const response = await handle(request, settings, duelEngine);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error.message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"Server error"}');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  createServer().listen(port, '0.0.0.0', () => console.log(`Hill Serpent listening on :${port}`));
}
