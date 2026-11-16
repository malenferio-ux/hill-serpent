import { chooseMove } from './agent.mjs';

export const DETAILS = { apiversion: '1', author: 'malenferio-ux', color: '#8b5cf6', head: 'default', tail: 'default', version: '1.6.0' };

export async function handle(request, env = {}) {
  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    return json({ ...DETAILS, ...(env.SNAKE_AUTHOR ? { author: env.SNAKE_AUTHOR } : {}) });
  }
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
  if (path !== '/move' && path !== '/start' && path !== '/end') return json({ error: 'Not found' }, 404);
  if (path !== '/move') return json({});
  if (Number(request.headers.get('content-length')) > 131072) return json({ error: 'Request too large' }, 413);
  try {
    const text = await request.text();
    if (text.length > 131072) return json({ error: 'Request too large' }, 413);
    const payload = JSON.parse(text);
    // Fixed work is essential: deployed Workers freeze timers during CPU work.
    const baseNodes = Number(env.SEARCH_NODES) || 256;
    const duel = payload.board?.snakes?.length === 2 && payload.game?.ruleset?.name !== 'constrictor';
    const result = chooseMove(payload, { nodes: duel ? baseNodes * 4 : baseNodes, depth: 7 });
    return json({ move: result.move });
  } catch (error) {
    console.error('move failed:', error.message);
    return json({ error: 'Invalid move request' }, 400);
  }
}

export default { fetch: handle };
