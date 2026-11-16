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
    const body = new Array(snake.body.length);
    body[0] = head;
    for (let k = 1; k < body.length; k++) body[k] = snake.body[k - 1];
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
  staticSafety: 0.5, territoryCap: 0, foodPotential: 0, tailRisk: 0, staticSpace: 0, staticTailSteps: 2, foodProgress: 0, foodRace: 0, leadTarget: 999, leadSlope: 1,
});
// Keep the four-player policy while improving food progress in duels.
const DUEL_WEIGHTS = Object.freeze({
  ...DEFAULT_WEIGHTS, length: 48, territoryCap: 0.4, foodPotential: 1, tailRisk: 1,
  staticSpace: 0, staticTailSteps: 2, foodProgress: 2, foodRace: 1, leadTarget: 6, leadSlope: 0.2,
});
const WIN = 1_000_000, LOSS = -1_000_000, DRAW = -10_000;
const STOP = Symbol('search budget exhausted');

// The buffers belong to one synchronous decision; requests share no game data.
class Evaluator {
  constructor(g, count, weights = {}) {
    this.g = g;
    this.duel = count === 2;
    this.weights = { ...(this.duel ? DUEL_WEIGHTS : DEFAULT_WEIGHTS), ...weights };
    this.distances = Array.from({ length: count }, () => new Int16Array(g.size));
    this.release = new Int16Array(g.size);
    this.queue = new Int16Array(g.size);
    this.areas = new Float64Array(count);
    this.spaces = new Float64Array(count);
    this.foodDistances = new Int16Array(count);
    this.raceFoodDistances = new Int16Array(count);
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
    let lengthAdjustment = 0;
    if (this.duel && !state.constrictor) {
      const diff = me.body.length - snakes[1].body.length, w = this.weights;
      if (diff > w.leadTarget) lengthAdjustment = -w.length * (diff - w.leadTarget) * (1 - w.leadSlope);
    }
    let enemy = -Infinity;
    for (let i = 1; i < snakes.length; i++) {
      if (snakes[i].alive) enemy = Math.max(enemy, this.value(state, i));
    }
    return own - (enemy === -Infinity ? 0 : enemy) + lengthAdjustment;
  }

  analyze(state) {
    const { g, snakes } = state;
    const { release, queue, distances, areas, spaces, foodDistances } = this;
    release.fill(0);
    areas.fill(0); spaces.fill(0); foodDistances.fill(999);
    this.raceFoodDistances.fill(999);
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
      // Also measure the region with only imminent tail releases open.
      // Reaching a moving tail alone is not a certificate that growing is safe.
      if (this.duel && this.weights.staticSafety > 0 && !state.constrictor) {
        const seen = this.seen;
        seen.fill(0); seen[s.body[0]] = 1;
        read = 0; end = 1; queue[0] = s.body[0];
        let room = 1;
        const tail = s.body[s.body.length - 1];
        let connected = false;
        // Stop only after certifying enough room. A tiny tail-connected region
        // can still become a trap after growth.
        const roomTarget = this.weights.staticSpace > 0 ? Math.ceil(s.body.length * 2.5) + 1 : s.body.length + 2;
        while (read < end && room < roomTarget) {
          const p = queue[read++];
          for (let m = 0; m < 4; m++) {
            const q = g.next[p * 4 + m];
            if (q < 0 || seen[q]) continue;
            if (release[q] > this.weights.staticTailSteps || release[q] > seen[p]) continue;
            if (!state.food[q] && s.health <= 1 + state.hazards[q] * state.hazardDamage) continue;
            seen[q] = seen[p] + 1; queue[end++] = q;
            room += state.hazards[q] ? 0.25 : 1;
            if (q === tail && q !== s.body[0]) connected = true;
            if (room >= roomTarget) break;
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
      if (owner >= 0 && distance < 999) {
        areas[owner] += state.hazards[p] ? 0.2 : 1;
        if (state.food[p]) this.raceFoodDistances[owner] = Math.min(this.raceFoodDistances[owner], distance);
      }
    }
    if (this.duel && this.weights.foodRace > 0 && !state.constrictor) {
      for (let i = 0; i < snakes.length; i++) {
        if (this.raceFoodDistances[i] < 999) foodDistances[i] = this.raceFoodDistances[i];
      }
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
    // Once there is sufficient safe territory, progress toward food matters
    // more than repeatedly reclaiming a few central cells.
    const territory = this.duel && !state.constrictor && w.territoryCap > 0
      ? Math.min(this.areas[index], Math.max(length * 2, state.g.size * w.territoryCap)) : this.areas[index];
    const mix = this.duel && !state.constrictor ? w.staticSpace : 0;
    const capacity = (1 - mix) * room + mix * this.staticSpaces[index];
    let score = w.territory * territory + w.space * Math.min(capacity, length * 2.5)
      + (state.constrictor ? 0 : w.length * effectiveLength) - w.trap * deficit;
    if (this.duel && w.staticSafety > 0 && !state.constrictor) {
      const openRoom = this.staticSpaces[index];
      const trapped = Math.max(0, length + 2 - openRoom) / (length + 2)
        * (this.tailConnected[index] ? w.tailRisk : 1);
      score -= w.staticSafety * w.trap * trapped;
      // A shorter head cannot rely on an exit that its rival reaches first.
      // Free geometric space alone misses this interception at a corridor end.
      const contested = Math.max(0, length + 2 - this.areas[index]) / (length + 2);
      score -= w.staticSafety * w.trap * 2 * contested;
    }
    if (!state.constrictor) {
      const distance = this.foodDistances[index];
      const urgency = s.health < 30 ? 3 : s.health < 55 ? 1.8 : 1;
      score += w.health * s.health;
      if (distance < 999) {
        if (this.duel && w.foodPotential > 0) {
          // A meal must not look bad simply because the next meal is far away.
          // This bounded, nonnegative potential is smaller than growth reward.
          const bonus = Math.min(w.length * 0.75, w.food * 4 * urgency);
          score += bonus / (distance + 1);
        } else score -= w.food * urgency * Math.min(distance, 20);
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

function orderMoves(state, index, occupied, preferred = -1, foodCells = null) {
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
    for (const q of foodCells ?? []) {
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

// A separate, bounded survival probe catches long body corridors beyond the
// completed minimax depth. Other heads are handled by the simultaneous tree;
// their current bodies get a small release margin for possible future growth.
function probeSurvival(state, firstMove, horizon = 12, limit = 128) {
  const { g } = state, me = state.snakes[0], release = new Int16Array(g.size);
  for (let i = 1; i < state.snakes.length; i++) {
    const s = state.snakes[i];
    if (!s.alive) continue;
    for (let k = 0; k < s.body.length; k++) {
      const d = s.body.length - k;
      release[s.body[k]] = Math.max(release[s.body[k]], d + (d > 1 ? 1 : 0));
    }
  }
  const food = state.food.slice();
  let nodes = 0, deepest = 0, exhausted = false;
  function visit(body, turn, move) {
    if (nodes >= limit) { exhausted = true; return true; }
    nodes++;
    const head = g.next[body[0] * 4 + move];
    if (head < 0 || release[head] > turn) return false;
    for (let k = 0; k < body.length - 1; k++) if (body[k] === head) return false;
    const next = new Array(body.length), ate = food[head];
    next[0] = head;
    for (let k = 1; k < next.length; k++) next[k] = body[k - 1];
    if (ate) { next.push(next.at(-1)); food[head] = 0; }
    deepest = Math.max(deepest, turn);
    let survives = turn >= horizon;
    if (!survives) {
      // Continuing straight is a fast certificate on an open board.
      const order = [move, ...[0, 1, 2, 3].filter(m => m !== move)];
      for (const m of order) if (visit(next, turn + 1, m)) { survives = true; break; }
    }
    if (ate) food[head] = ate;
    return survives;
  }
  const survives = visit(me.body, 1, firstMove);
  return { trapped: !survives && !exhausted, nodes, deepest };
}

// AND/OR search for a forced loss, including the opponent's NEW body.
// A budget exhaustion is unknown, never a certificate of a trap.
function probeReplies(state, firstMove, horizon = 20, limit = 256) {
  let nodes = 0, deepest = 0, exhausted = false;
  function losing(s, remaining, forced = -1, lastMove = firstMove) {
    if (!s.snakes[0].alive) return s.snakes[1].alive;
    if (!s.snakes[1].alive || !remaining) return false;
    const occupied = occupancy(s);
    const own = forced >= 0 ? [forced] : legalMoves(s, 0, occupied);
    own.sort((a, b) => (b === lastMove) - (a === lastMove));
    for (const m of own) {
      const target = s.g.next[s.snakes[0].body[0] * 4 + m];
      const replies = legalMoves(s, 1, occupied);
      const distance = o => {
        const p = s.g.next[s.snakes[1].body[0] * 4 + o];
        if (p < 0 || target < 0) return 999;
        let dx = Math.abs(p % s.g.width - target % s.g.width), dy = Math.abs((p / s.g.width | 0) - (target / s.g.width | 0));
        if (s.g.wrapped) { dx = Math.min(dx, s.g.width - dx); dy = Math.min(dy, s.g.height - dy); }
        return dx + dy - (o === m ? 0.1 : 0);
      };
      replies.sort((a, b) => distance(a) - distance(b));
      let kill = false;
      for (const reply of replies) {
        if (nodes >= limit) { exhausted = true; return false; }
        nodes++; deepest = Math.max(deepest, horizon - remaining + 1);
        if (losing(step(s, [m, reply]), remaining - 1, -1, m)) { kill = true; break; }
      }
      if (!kill) return false;
    }
    return true;
  }
  return { trapped: losing(state, horizon, firstMove), nodes, deepest, exhausted };
}

function chooseMove(request, options = {}) {
  return decide(fromRequest(request), options);
}

function decide(state, options = {}) {
  const nodeLimit = Math.max(64, Math.min(40_000, Number(options.nodes) || 3200));
  const maxDepth = Math.max(1, Math.min(12, Number(options.depth) || 7));
  const rootOccupied = occupancy(state);
  const mine = legalMoves(state, 0, rootOccupied);
  if (mine.length === 1) return { move: DIRECTIONS[mine[0]], score: 0, nodes: 0, depth: 0, fallbackScores: {}, survival: {}, forced: true };
  const evaluator = new Evaluator(state.g, state.snakes.length, options.weights);
  const opponents = state.snakes.map((s, i) => i ? legalMoves(state, i, rootOccupied) : mine);
  // A forced immediate win takes precedence over any longer solo-space probe.
  if (state.snakes.length === 2) {
    const winner = mine.find(move => opponents[1].every(reply => {
      const next = step(state, [move, reply]);
      return next.snakes[0].alive && !next.snakes[1].alive;
    }));
    if (winner !== undefined) return { move: DIRECTIONS[winner], score: WIN - 10, nodes: 0, depth: 1, fallbackScores: {}, survival: {}, immediateWin: true };
  }
  let nodes = 0, completedDepth = 0;
  let bestMove = mine[0], bestScore = LOSS;
  const scores = {}, survival = {};
  const variations = new Map();
  const guardPenalty = new Float64Array(4);
  // A small root preference keeps shallow even-depth searches progressing
  // toward an existing meal. Measure against the SAME food set after eating.
  // Terminal outcomes and proven traps still dominate this bounded preference.
  if (state.snakes.length === 2 && !state.constrictor && evaluator.weights.foodProgress > 0) {
    let foods = [];
    for (let q = 0; q < state.g.size; q++) if (state.food[q]) foods.push(q);
    if (evaluator.weights.foodRace > 0) {
      evaluator.analyze(state);
      const mineDistance = evaluator.distances[0], enemyDistance = evaluator.distances[1];
      const available = foods.filter(q => mineDistance[q] < 999 && (mineDistance[q] < enemyDistance[q]
        || (mineDistance[q] === enemyDistance[q] && state.snakes[0].body.length > state.snakes[1].body.length)));
      if (available.length) foods = available;
    }
    const distance = p => Math.min(...foods.map(q => {
      let dx = Math.abs(p % state.g.width - q % state.g.width), dy = Math.abs((p / state.g.width | 0) - (q / state.g.width | 0));
      if (state.g.wrapped) { dx = Math.min(dx, state.g.width - dx); dy = Math.min(dy, state.g.height - dy); }
      return dx + dy;
    }));
    if (foods.length && (state.snakes[0].body.length - state.snakes[1].body.length < evaluator.weights.leadTarget || state.snakes[0].health < 55)) {
      const before = distance(state.snakes[0].body[0]);
      for (const move of mine) {
        const target = state.g.next[state.snakes[0].body[0] * 4 + move];
        if (target >= 0) guardPenalty[move] = evaluator.weights.foodProgress * (distance(target) - before);
      }
    }
  }
  if (options.soloGuard !== false && state.snakes.length === 2 && !state.constrictor) {
    for (const move of mine) {
      const probe = probeSurvival(state, move, Math.min(64, Math.max(20, state.snakes[0].body.length + 8)), 256);
      const ownHead = state.snakes[0].body[0], otherHead = state.snakes[1].body[0], target = state.g.next[ownHead * 4 + move];
      const x = target % state.g.width, y = target / state.g.width | 0;
      const edge = Math.min(x, y, state.g.width - 1 - x, state.g.height - 1 - y);
      const gap = Math.abs(ownHead % state.g.width - otherHead % state.g.width) + Math.abs((ownHead / state.g.width | 0) - (otherHead / state.g.width | 0));
      if (options.replyGuard !== false && !probe.trapped && (gap <= 5 || (edge <= 2 && gap <= 10))) {
        const joint = probeReplies(state, move, 20, Math.max(64, Math.min(512, Number(options.replyNodes) || 256)));
        probe.soloNodes = probe.nodes; probe.replyNodes = joint.nodes;
        probe.replyExhausted = joint.exhausted; probe.replyDepth = joint.deepest;
        probe.nodes += joint.nodes;
        if (joint.trapped) { probe.trapped = true; probe.deepest = joint.deepest; probe.kind = 'forced-replies'; }
      }
      survival[DIRECTIONS[move]] = probe;
      if (probe.trapped) guardPenalty[move] += Math.max(0, Math.min(5000, Number(options.guardPenalty ?? 1200)));
    }
  }

  // Prefer a move with a surviving continuation under the bounded safety
  // model. A finite heuristic penalty could otherwise be outweighed by a
  // pessimistic space score on the safe move. If every move is marked unsafe,
  // keep all of them so the ordinary search can choose how to resist.
  const unprovenRoot = mine.filter(move => !survival[DIRECTIONS[move]]?.trapped);
  const allowedRoot = unprovenRoot.length ? unprovenRoot : mine;

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
    const adjusted = Math.abs(score) < WIN / 2 ? score - guardPenalty[move] : score;
    scores[DIRECTIONS[move]] = adjusted;
    if (allowedRoot.includes(move) && adjusted > bestScore) { bestScore = adjusted; bestMove = move; }
  }

  if (allowedRoot.length === 1) return { move: DIRECTIONS[allowedRoot[0]], score: bestScore, nodes: 0, depth: 0, fallbackScores: scores, survival, forced: true };

  function search(s, depth, alpha, beta, ply, preferred = -1) {
    const terminal = !s.snakes[0].alive || (s.snakes.length > 1 && !s.snakes.slice(1).some(x => x.alive));
    if (!depth || terminal) return { score: evaluator.evaluate(s, ply), move: -1 };
    if (nodes >= nodeLimit) throw STOP;
    const occupied = occupancy(s);
    // Hash collisions affect ordering only: cached scores are never reused.
    let key = 2166136261;
    for (const snake of s.snakes) {
      key = Math.imul(key ^ snake.health ^ (snake.alive ? 512 : 0), 16777619);
      for (const cell of snake.body) key = Math.imul(key ^ (cell + 1), 16777619);
      key = Math.imul(key ^ 65535, 16777619);
    }
    const previous = variations.get(key);
    const foodCells = [];
    for (let q = 0; q < s.g.size; q++) if (s.food[q]) foodCells.push(q);
    const choices = s.snakes.map((snake, i) => orderMoves(s, i, occupied,
      i === 0 ? (preferred >= 0 ? preferred : previous?.move ?? -1) : -1, foodCells));
    const replyMoves = new Int8Array(4).fill(-1);
    if (ply === 0) choices[0] = choices[0].filter(move => allowedRoot.includes(move));
    const joint = new Array(s.snakes.length).fill(0);
    let best = -Infinity, selected = choices[0][0];
    for (const move of choices[0]) {
      joint[0] = move;
      if (choices.length === 2 && previous?.replies[move] >= 0) {
        const firstReply = previous.replies[move];
        choices[1].sort((a, b) => (b === firstReply) - (a === firstReply));
      }
      const penalty = ply === 0 ? guardPenalty[move] : 0;
      const rawBound = value => penalty && Math.abs(value) < WIN / 2 ? value + penalty : value;
      let worst = Infinity;
      function replies(index) {
        if (worst <= alpha) return;
        if (index === choices.length) {
          if (nodes >= nodeLimit) throw STOP;
          nodes++;
          const child = step(s, joint);
          const result = search(child, depth - 1, rawBound(alpha), rawBound(Math.min(beta, worst)), ply + 1);
          const value = penalty && Math.abs(result.score) < WIN / 2 ? result.score - penalty : result.score;
          if (value < worst) { worst = value; replyMoves[move] = joint[1]; }
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
    variations.set(key, { move: selected, replies: replyMoves });
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
  return { move: DIRECTIONS[bestMove], score: bestScore, nodes, depth: completedDepth, fallbackScores: scores, survival };
}

// worker.mjs

const DETAILS = { apiversion: '1', author: 'malenferio-ux', color: '#8b5cf6', head: 'default', tail: 'default', version: '1.7.0' };

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
    const baseNodes = Number(env.SEARCH_NODES) || 256;
    const duel = payload.board?.snakes?.length === 2 && payload.game?.ruleset?.name !== 'constrictor';
    const result = chooseMove(payload, { nodes: duel ? baseNodes * 2 : baseNodes, depth: 7 });
    return json({ move: result.move });
  } catch (error) {
    console.error('move failed:', error.message);
    return json({ error: 'Invalid move request' }, 400);
  }
}

export default { fetch: handle };
