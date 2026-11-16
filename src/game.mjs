// Our simulator follows the published rules, not another snake's implementation.
// Food spawning and future Royale shrinks are deliberately outside the search.
export const DIRECTIONS = ['up', 'down', 'left', 'right'];
const geometries = new Map();

export function geometry(width, height, wrapped = false) {
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

export function fromRequest(request) {
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

export function occupancy(state) {
  const occupied = new Uint8Array(state.g.size);
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    // Every snake pops its last segment before collisions. A duplicated tail
    // still occupies its square through the penultimate segment.
    for (let j = 0; j < snake.body.length - 1; j++) occupied[snake.body[j]] = 1;
  }
  return occupied;
}

export function legalMoves(state, index, occupied = occupancy(state)) {
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

export function defaultMove(state, index = 0) {
  const b = state.snakes[index].body;
  if (b.length > 1) {
    for (let d = 0; d < 4; d++) if (state.g.next[b[1] * 4 + d] === b[0]) return d;
  }
  return 0;
}

export function step(state, moves) {
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

export function toRequest(state, index = 0) {
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
