// game.mjs
// Our simulator follows the published rules, not another snake's implementation.
// Food spawning and future Royale shrinks are deliberately outside the search.
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const geometries = new Map();

function geometry(width, height, wrapped = false) {
  const key = `${width}:${height}:${wrapped}`;
  if (geometries.has(key)) return geometries.get(key);
  const size = width * height;
  const next = new Int16Array(size * 4).fill(-1);
  for (let p = 0; p < size; p++) {
    const x = p % width, y = (p / width) | 0;
    next[p * 4] = y + 1 < height ? p + width : wrapped ? x : -1;
    next[p * 4 + 1] = y > 0 ? p - width : wrapped ? (height - 1) * width + x : -1;
    next[p * 4 + 2] = x > 0 ? p - 1 : wrapped ? p + width - 1 : -1;
    next[p * 4 + 3] = x + 1 < width ? p + 1 : wrapped ? p - width + 1 : -1;
  }
  const g = { width, height, size, next, wrapped };
  // Bound the cache even when an Internet client supplies many board sizes.
  if (geometries.size >= 16) geometries.delete(geometries.keys().next().value);
  geometries.set(key, g);
  return g;
}

function fromRequest(request) {
  const { board, you, game } = request ?? {};
  if (!board || !you || !game || !Array.isArray(board.snakes)) throw new Error('Missing board, you or game');
  const { width, height } = board;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 25 || height > 25) {
    throw new Error('Board dimensions must be 2..25');
  }
  if (board.snakes.length > 8) throw new Error('Too many snakes');
  const rule = game.ruleset?.name ?? 'standard';
  if (rule === 'squad') throw new Error('Squad rules are not supported');
  const g = geometry(width, height, rule.includes('wrapped'));
  function cell(p) {
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
      throw new Error('Invalid cell');
    }
    return p.y * width + p.x;
  }
  const raw = [...board.snakes];
  const mine = raw.findIndex(s => s.id === you.id);
  if (mine < 0) throw new Error('Your snake is missing');
  [raw[0], raw[mine]] = [raw[mine], raw[0]];
  const snakes = raw.map(s => {
    if (!Array.isArray(s.body) || !s.body.length || s.body.length > g.size + 2) throw new Error('Invalid body');
    if (!Number.isFinite(s.health) || s.health < 0 || s.health > 100) throw new Error('Invalid health');
    return { id: s.id, body: s.body.map(cell), health: s.health, alive: s.health > 0 };
  });
  const food = new Uint8Array(g.size), hazards = new Uint8Array(g.size);
  for (const p of board.food ?? []) food[cell(p)] = 1;
  for (const p of board.hazards ?? []) hazards[cell(p)]++;
  const settings = game.ruleset?.settings ?? {};
  return {
    g, snakes, food, hazards, turn: request.turn ?? 0,
    constrictor: rule.includes('constrictor'), royale: rule === 'royale',
    hazardDamage: Math.max(0, Math.min(100, settings.hazardDamagePerTurn ?? 14)),
    shrinkEvery: settings.royale?.shrinkEveryNTurns ?? 20,
  };
}

function occupancy(state) {
  const occupied = new Uint8Array(state.g.size);
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    // Every snake pops its last segment before collisions. A duplicated tail
    // still occupies its square through the penultimate segment.
    for (let j = 0; j < snake.body.length - 1; j++) occupied[snake.body[j]] = 1;
  }
  return occupied;
}

function legalMoves(state, index, occupied = occupancy(state)) {
  const snake = state.snakes[index];
  if (!snake.alive) return [0];
  const moves = [], offset = snake.body[0] * 4;
  for (let move = 0; move < 4; move++) {
    const p = state.g.next[offset + move];
    if (p < 0 || occupied[p]) continue;
    if (!state.constrictor && !state.food[p] && snake.health <= 1 + state.hazards[p] * state.hazardDamage) continue;
    moves.push(move);
  }
  // A forced loss must still have a branch in the game tree.
  return moves.length ? moves : [defaultMove(state, index)];
}

function defaultMove(state, index = 0) {
  const b = state.snakes[index].body;
  if (b.length > 1) {
    for (let d = 0; d < 4; d++) if (state.g.next[b[1] * 4 + d] === b[0]) return d;
  }
  return 0;
}

function step(state, moves) {
  const { g, food, hazards, hazardDamage } = state;
  const eaten = [];
  const snakes = state.snakes.map((snake, i) => {
    if (!snake.alive) return snake;
    const head = g.next[snake.body[0] * 4 + moves[i]];
    const body = [head, ...snake.body.slice(0, -1)];
    let health = snake.health - 1;
    if (head >= 0 && food[head]) {
      health = 100;
      body.push(body[body.length - 1]);
      eaten.push(head);
    } else if (head >= 0) {
      health = Math.max(0, health - hazards[head] * hazardDamage);
    }
    // Starved/out-of-bounds snakes are removed before collision checks.
    return { id: snake.id, body, health, alive: head >= 0 && health > 0 };
  });
  const dead = new Uint8Array(snakes.length);
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    if (!s.alive) continue;
    const head = s.body[0];
    for (let j = 0; j < snakes.length; j++) {
      const other = snakes[j];
      if (!other.alive) continue;
      for (let k = 1; k < other.body.length; k++) {
        if (head === other.body[k]) { dead[i] = 1; break; }
      }
      if (j !== i && head === other.body[0] && s.body.length <= other.body.length) dead[i] = 1;
    }
  }
  for (let i = 0; i < snakes.length; i++) {
    if (dead[i]) snakes[i].alive = false;
    if (state.constrictor && snakes[i].alive) {
      const b = snakes[i].body;
      snakes[i].health = 100;
      if (b.length === 1 || b[b.length - 1] !== b[b.length - 2]) b.push(b[b.length - 1]);
    }
  }
  let nextFood = food;
  if (eaten.length) {
    nextFood = food.slice();
    for (const p of eaten) nextFood[p] = 0;
  }
  return { ...state, snakes, food: nextFood, turn: state.turn + 1 };
}

function toRequest(state, index = 0) {
  const point = p => ({ x: p % state.g.width, y: (p / state.g.width) | 0 });
  const snakes = state.snakes.filter(s => s.alive).map(s => ({
    id: s.id, name: s.id, health: s.health, body: s.body.map(point),
    head: point(s.body[0]), length: s.body.length, latency: '0', shout: '',
  }));
  return {
    game: { id: 'local', timeout: 500, ruleset: {
      name: state.constrictor ? 'constrictor' : state.royale ? 'royale' : 'standard',
      version: 'local', settings: { hazardDamagePerTurn: state.hazardDamage, royale: { shrinkEveryNTurns: state.shrinkEvery } },
    } },
    turn: state.turn,
    board: { width: state.g.width, height: state.g.height, snakes,
      food: Array.from(state.food.keys()).filter(p => state.food[p]).map(point),
      hazards: Array.from(state.hazards.keys()).flatMap(p => Array(state.hazards[p]).fill(point(p))),
    },
    you: snakes.find(s => s.id === state.snakes[index].id),
  };
}

// agent.mjs

const DEFAULT_WEIGHTS = Object.freeze({
  territory: 1.8, length: 32, food: 6, health: 0.16,
  space: 1.2, trap: 450, mobility: 8, center: 0.35,
  staticSafety: 0.5,
});
const WIN = 1_000_000, LOSS = -1_000_000, DRAW = -10_000;
const STOP = Symbol('search budget exhausted');

// The buffers belong to one synchronous decision; requests share no game data.
class Evaluator {
  constructor(g, count, weights = DEFAULT_WEIGHTS) {
    this.g = g;
    this.duel = count === 2;
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    this.distances = Array.from({ length: count }, () => new Int16Array(g.size));
    this.release = new Int16Array(g.size);
    this.queue = new Int16Array(g.size);
    this.areas = new Float64Array(count);
    this.spaces = new Float64Array(count);
    this.foodDistances = new Int16Array(count);
    this.staticSpaces = new Float64Array(count);
    this.tailConnected = new Uint8Array(count);
    this.seen = new Int16Array(g.size);
  }

  evaluate(state, ply = 0) {
    const { snakes, g } = state;
    const me = snakes[0];
    let opponents = 0;
    for (let i = 1; i < snakes.length; i++) if (snakes[i].alive) opponents++;
    if (!me.alive) return opponents ? LOSS + ply * 10 : DRAW + ply;
    if (!opponents && snakes.length > 1) return WIN - ply * 10;
    this.analyze(state);
    const own = this.value(state, 0);
    let enemy = -Infinity;
    for (let i = 1; i < snakes.length; i++) {
      if (snakes[i].alive) enemy = Math.max(enemy, this.value(state, i));
    }
    return own - (enemy === -Infinity ? 0 : enemy);
  }

  analyze(state) {
    const { g, snakes } = state;
    const { release, queue, distances, areas, spaces, foodDistances } = this;
    release.fill(0);
    areas.fill(0); spaces.fill(0); foodDistances.fill(999);
    this.staticSpaces.fill(0); this.tailConnected.fill(0);
    for (const s of snakes) {
      if (!s.alive) continue;
      for (let k = 0; k < s.body.length; k++) {
        const p = s.body[k];
        release[p] = Math.max(release[p], state.constrictor ? 999 : s.body.length - k);
      }
    }
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i], dist = distances[i];
      dist.fill(999);
      if (!s.alive) continue;
      let read = 0, end = 1;
      queue[0] = s.body[0]; dist[s.body[0]] = 0;
      while (read < end) {
        const p = queue[read++], d = dist[p] + 1;
        for (let m = 0; m < 4; m++) {
          const q = g.next[p * 4 + m];
          if (q < 0 || dist[q] !== 999 || release[q] > d) continue;
          // Hazards remain traversable if there is enough health for one visit.
          // Full future path health is resolved by the exact tree simulation.
          if (!state.food[q] && !state.constrictor && s.health <= d + state.hazards[q] * state.hazardDamage) continue;
          dist[q] = d; queue[end++] = q;
          spaces[i] += state.hazards[q] ? 0.25 : 1;
          if (state.food[q]) foodDistances[i] = Math.min(foodDistances[i], d);
        }
      }
      // Temporal flood fill is optimistic: it can count the whole board even
      // inside a sealed corridor because every body eventually "disappears".
      // Also measure the region with only the next two tail releases open.
      // A connected, moving own tail is a valid escape rather than a prison.
      if (this.duel && this.weights.staticSafety > 0 && !state.constrictor) {
        const seen = this.seen;
        seen.fill(0); seen[s.body[0]] = 1;
        read = 0; end = 1; queue[0] = s.body[0];
        let room = 1;
        const tail = s.body[s.body.length - 1];
        let connected = false;
        // The heuristic only needs a certificate of enough room or an escape
        // to our moving tail, not the size of the entire open component.
        while (read < end && room < s.body.length + 2 && !connected) {
          const p = queue[read++];
          for (let m = 0; m < 4; m++) {
            const q = g.next[p * 4 + m];
            if (q < 0 || seen[q]) continue;
            if (release[q] > 2 || release[q] > seen[p]) continue;
            if (!state.food[q] && s.health <= 1 + state.hazards[q] * state.hazardDamage) continue;
            seen[q] = seen[p] + 1; queue[end++] = q;
            room += state.hazards[q] ? 0.25 : 1;
            if (q === tail && q !== s.body[0]) connected = true;
            if (connected || room >= s.body.length + 2) break;
          }
        }
        this.staticSpaces[i] = room;
        this.tailConnected[i] = connected ? 1 : 0;
      } else this.staticSpaces[i] = spaces[i] + 1;
    }
    for (let p = 0; p < g.size; p++) {
      let owner = -1, distance = 999, length = 0;
      for (let i = 0; i < snakes.length; i++) {
        if (!snakes[i].alive) continue;
        const d = distances[i][p], len = snakes[i].body.length;
        if (d < distance || (d === distance && len > length)) {
          owner = i; distance = d; length = len;
        } else if (d === distance && len === length) owner = -1;
      }
      if (owner >= 0 && distance < 999) areas[owner] += state.hazards[p] ? 0.2 : 1;
    }
  }

  value(state, index) {
    const s = state.snakes[index], w = this.weights;
    const length = s.body.length, room = this.spaces[index];
    const deficit = Math.max(0, length + 2 - room) / (length + 2);
    let maxOther = 0;
    for (let i = 0; i < state.snakes.length; i++) {
      if (i !== index && state.snakes[i].alive) {
        maxOther = Math.max(maxOther, state.snakes[i].body.length);
      }
    }
    // Do not cap each snake relative to the other's length: when trailing by
    // 3+ segments those two caps cancel and eating earns no length advantage.
    // With several opponents retain the more conservative growth policy.
    const effectiveLength = state.snakes.length > 2 ? Math.min(length, maxOther + 2) : length;
    let score = w.territory * this.areas[index] + w.space * Math.min(room, length * 2.5)
      + (state.constrictor ? 0 : w.length * effectiveLength) - w.trap * deficit;
    if (this.duel && w.staticSafety > 0 && !state.constrictor) {
      const openRoom = this.staticSpaces[index];
      const trapped = this.tailConnected[index] ? 0 : Math.max(0, length + 2 - openRoom) / (length + 2);
      score -= w.staticSafety * w.trap * trapped;
      // A shorter head cannot rely on an exit that its rival reaches first.
      // Free geometric space alone misses this interception at a corridor end.
      const contested = maxOther >= length ? Math.max(0, length + 2 - this.areas[index]) / (length + 2) : 0;
      score -= w.staticSafety * w.trap * 2 * contested;
    }
    if (!state.constrictor) {
      const distance = this.foodDistances[index];
      const urgency = s.health < 30 ? 3 : s.health < 55 ? 1.8 : 1;
      score += w.health * s.health;
      if (distance < 999) {
        score -= w.food * urgency * Math.min(distance, 20);
        if (distance >= s.health) score -= 600;
      } else if (s.health < 35) score -= (35 - s.health) * 10;
    }
    const p = s.body[0];
    let exits = 0;
    for (let m = 0; m < 4; m++) {
      const q = state.g.next[p * 4 + m];
      if (q >= 0 && this.release[q] <= 1) exits++;
    }
    score += w.mobility * Math.min(exits, 2);
    const x = p % state.g.width, y = (p / state.g.width) | 0;
    score -= w.center * (Math.abs(x - (state.g.width - 1) / 2) + Math.abs(y - (state.g.height - 1) / 2));
    if (state.royale && state.hazards[p]) score -= 45 + (100 - s.health) * 0.8;
    return score;
  }
}

function orderMoves(state, index, occupied, preferred = -1) {
  const snake = state.snakes[index];
  if (!snake.alive) return [0];
  const moves = legalMoves(state, index, occupied);
  const scored = moves.map(move => {
    const p = state.g.next[snake.body[0] * 4 + move];
    if (p < 0) return [move, -1e6];
    let value = move === preferred ? 1e5 : 0;
    if (state.food[p]) value += 30;
    value -= state.hazards[p] * 12;
    let distance = 100;
    for (let q = 0; q < state.g.size; q++) if (state.food[q]) {
      distance = Math.min(distance, Math.abs(p % state.g.width - q % state.g.width)
        + Math.abs(((p / state.g.width) | 0) - ((q / state.g.width) | 0)));
    }
    value -= distance;
    for (let d = 0; d < 4; d++) {
      const q = state.g.next[p * 4 + d];
      if (q >= 0 && !occupied[q]) value += 3;
    }
    return [move, value];
  });
  scored.sort((a, b) => b[1] - a[1]);
  return scored.map(x => x[0]);
}

function chooseMove(request, options = {}) {
  return decide(fromRequest(request), options);
}

function decide(state, options = {}) {
  const nodeLimit = Math.max(64, Math.min(40_000, Number(options.nodes) || 3200));
  const maxDepth = Math.max(1, Math.min(12, Number(options.depth) || 7));
  const evaluator = new Evaluator(state.g, state.snakes.length, options.weights);
  const rootOccupied = occupancy(state);
  const mine = legalMoves(state, 0, rootOccupied);
  const opponents = state.snakes.map((s, i) => i ? legalMoves(state, i, rootOccupied) : mine);
  let nodes = 0, completedDepth = 0;
  let bestMove = mine[0], bestScore = LOSS;
  const scores = {};

  // An always-complete fallback checks every immediate head threat, including
  // food-induced changes in length. No partial deep iteration may replace it.
  for (const move of mine) {
    const p = state.g.next[state.snakes[0].body[0] * 4 + move];
    let danger = 0;
    for (let i = 1; i < state.snakes.length; i++) {
      const s = state.snakes[i];
      if (!s.alive) continue;
      if (s.body.length >= state.snakes[0].body.length && opponents[i].some(m => state.g.next[s.body[0] * 4 + m] === p)) danger++;
    }
    const joint = opponents.map(m => m[0]); joint[0] = move;
    const next = step(state, joint);
    const score = evaluator.evaluate(next, 1) - danger * 200_000;
    scores[DIRECTIONS[move]] = score;
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  function search(s, depth, alpha, beta, ply, preferred = -1) {
    const terminal = !s.snakes[0].alive || (s.snakes.length > 1 && !s.snakes.slice(1).some(x => x.alive));
    if (!depth || terminal) return { score: evaluator.evaluate(s, ply), move: -1 };
    if (nodes >= nodeLimit) throw STOP;
    const occupied = occupancy(s);
    const choices = s.snakes.map((snake, i) => orderMoves(s, i, occupied, i === 0 ? preferred : -1));
    const joint = new Array(s.snakes.length).fill(0);
    let best = -Infinity, selected = choices[0][0];
    for (const move of choices[0]) {
      joint[0] = move;
      let worst = Infinity;
      function replies(index) {
        if (worst <= alpha) return;
        if (index === choices.length) {
          if (nodes >= nodeLimit) throw STOP;
          nodes++;
          const child = step(s, joint);
          const result = search(child, depth - 1, alpha, Math.min(beta, worst), ply + 1);
          worst = Math.min(worst, result.score);
          return;
        }
        for (const reply of choices[index]) {
          joint[index] = reply;
          replies(index + 1);
          if (worst <= alpha) break;
        }
      }
      replies(1);
      if (worst > best) { best = worst; selected = move; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: selected };
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const result = search(state, depth, -Infinity, Infinity, 0, bestMove);
      bestMove = result.move; bestScore = result.score; completedDepth = depth;
      if (Math.abs(bestScore) > WIN / 2) break;
    } catch (error) {
      if (error !== STOP) throw error;
      break;
    }
  }
  return { move: DIRECTIONS[bestMove], score: bestScore, nodes, depth: completedDepth, fallbackScores: scores };
}

// worker.mjs

const DETAILS = { apiversion: '1', author: 'malenferio-ux', color: '#8b5cf6', head: 'default', tail: 'default', version: '1.1.0' };

async function handle(request, env = {}) {
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
    const result = chooseMove(payload, { nodes: Number(env.SEARCH_NODES) || 256, depth: 7 });
    return json({ move: result.move });
  } catch (error) {
    console.error('move failed:', error.message);
    return json({ error: 'Invalid move request' }, 400);
  }
}

export default { fetch: handle };
