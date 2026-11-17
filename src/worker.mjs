import { chooseMove } from './agent.mjs';

export const DETAILS = { apiversion: '1', author: 'malenferio-ux', color: '#8b5cf6', head: 'default', tail: 'default', version: '1.11.0' };

export async function handle(request, env = {}, engine = null) {
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
    const accelerated = engine && duel && (payload.game?.ruleset?.name ?? 'standard') === 'standard' && !(payload.board?.hazards?.length);
    const workBudget = accelerated ? Number(env.DUEL_WORK_BUDGET) || 1_000_000 : 0;
    const nodes = accelerated ? (Number(env.DUEL_SEARCH_NODES) || 40_000)
      : duel ? (Number(env.JS_DUEL_SEARCH_NODES) || Number(env.DUEL_SEARCH_NODES) || baseNodes * 2) : baseNodes;
    const result = chooseMove(payload, { nodes, depth: accelerated ? 12 : 7, workBudget,
      ...(accelerated ? { searchEngine: engine.search, survivalEngine: engine.guards } : {}) });
    return json({ move: result.move });
  } catch (error) {
    console.error('move failed:', error.message);
    return json({ error: 'Invalid move request' }, 400);
  }
}

export default { fetch: handle };
