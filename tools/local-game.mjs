import { geometry, legalMoves, occupancy, step, toRequest } from '../src/game.mjs';
import { decide, Evaluator } from '../src/agent.mjs';

export function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function start(seed, mode = 'duel') {
  const rng = random(seed), g = geometry(11, 11);
  const pairs = [[12, 108], [20, 100], [16, 104], [56, 64]];
  const pair = pairs[(rng() * pairs.length) | 0];
  const positions = mode === 'standard' || mode === 'royale' ? [12, 108, 20, 100] : pair;
  const food = new Uint8Array(121);
  food[60] = 1;
  for (const p of positions) {
    const choices = [0, 1, 2, 3].map(m => g.next[p * 4 + m]).filter(q => q >= 0 && !positions.includes(q));
    food[choices[(rng() * choices.length) | 0]] = 1;
  }
  return { g, snakes: positions.map((p, i) => ({ id: `s${i}`, body: [p, p, p], health: 100, alive: true })),
    food: mode === 'constrictor' ? new Uint8Array(121) : food,
    hazards: new Uint8Array(121), constrictor: mode === 'constrictor', royale: mode === 'royale',
    hazardDamage: 14, shrinkEvery: 20, turn: 0 };
}

export function perspective(state, index) {
  const snakes = [...state.snakes];
  [snakes[0], snakes[index]] = [snakes[index], snakes[0]];
  // Real /move requests omit eliminated snakes. Match that at each new
  // decision while retaining the complete outer state for match outcomes.
  return { ...state, snakes: snakes.filter(s => s.alive) };
}

function flood(state, head, occupied) {
  const seen = new Uint8Array(state.g.size), queue = [head];
  seen[head] = 1;
  for (let i = 0; i < queue.length; i++) for (let m = 0; m < 4; m++) {
    const q = state.g.next[queue[i] * 4 + m];
    if (q >= 0 && !seen[q] && !occupied[q]) { seen[q] = 1; queue.push(q); }
  }
  return queue.length;
}

// These are our own deliberately different sparring partners. They do NOT
// implement or stand in for the course's Novice/Apprentice/Journeyman/Expert.
export function baseline(state, kind, rng = () => 0.5) {
  const occupied = occupancy(state), moves = legalMoves(state, 0, occupied);
  const me = state.snakes[0], g = state.g;
  let best = -Infinity, selected = moves[0];
  for (const move of moves) {
    const p = g.next[me.body[0] * 4 + move];
    if (p < 0) continue;
    let score = rng() * 0.2;
    let foodDistance = 100;
    for (let q = 0; q < g.size; q++) if (state.food[q]) {
      foodDistance = Math.min(foodDistance, Math.abs(p % g.width - q % g.width)
        + Math.abs(((p / g.width) | 0) - ((q / g.width) | 0)));
    }
    score -= foodDistance * (me.health < 35 ? 5 : 1.5);
    if (state.food[p]) score += 12;
    score -= state.hazards[p] * 30;
    for (let i = 1; i < state.snakes.length; i++) {
      const enemy = state.snakes[i];
      if (!enemy.alive) continue;
      const adjacent = legalMoves(state, i, occupied).some(m => g.next[enemy.body[0] * 4 + m] === p);
      if (adjacent && enemy.body.length >= me.body.length) score -= 10000;
      if (kind === 'hunter' && adjacent && enemy.body.length < me.body.length) score += 30;
    }
    if (kind !== 'greedy') score += flood(state, p, occupied) * 1.5;
    if (kind === 'hunter') {
      const copy = perspective(state, 0);
      const evaluator = new Evaluator(g, state.snakes.length);
      const joint = state.snakes.map((s, i) => i ? legalMoves(state, i, occupied)[0] : move);
      score += evaluator.evaluate(step(copy, joint)) * 0.1;
    }
    if (score > best) { best = score; selected = move; }
  }
  return selected;
}

export function environment(state, rng, safeBox) {
  if (state.constrictor) return state;
  const food = state.food.slice();
  const occupied = new Uint8Array(state.g.size);
  for (const s of state.snakes) if (s.alive) for (const p of s.body) occupied[p] = 1;
  function addFood() {
    const empty = [];
    for (let p = 0; p < state.g.size; p++) if (!occupied[p] && !food[p]) empty.push(p);
    if (empty.length) food[empty[(rng() * empty.length) | 0]] = 1;
  }
  if (!food.some(Boolean)) addFood();
  if (rng() < 0.15) addFood();
  const hazards = state.hazards.slice();
  if (state.royale && state.turn > 0 && state.turn % state.shrinkEvery === 0) {
    const side = (rng() * 4) | 0;
    safeBox[side] += side % 2 === 0 ? 1 : -1;
    for (let p = 0; p < state.g.size; p++) {
      const x = p % 11, y = (p / 11) | 0;
      if (x < safeBox[0] || x > safeBox[1] || y < safeBox[2] || y > safeBox[3]) hazards[p] = 1;
    }
  }
  return { ...state, food, hazards };
}

export async function match({ seed, opponent = 'space', nodes = 256, weights, mode = 'duel', swap = false,
  maxTurns = 500, record = false, opponentNodes = 128, opponentWeights } = {}) {
  let state = start(seed, mode);
  if (swap) [state.snakes[0].body, state.snakes[1].body] = [state.snakes[1].body, state.snakes[0].body];
  const rng = random(seed ^ 0xA5A5A5A5), safeBox = [0, 10, 0, 10];
  const frames = record ? [toRequest(state)] : [];
  let maxMs = 0, calls = 0, totalMs = 0;
  while (state.turn < maxTurns && state.snakes[0].alive && state.snakes.slice(1).some(s => s.alive)) {
    const moves = [];
    for (let i = 0; i < state.snakes.length; i++) {
      if (!state.snakes[i].alive) { moves.push(0); continue; }
      const view = perspective(state, i), before = performance.now();
      let move;
      if (i === 0 || opponent === 'search') {
        const result = decide(view, { nodes: i === 0 ? nodes : opponentNodes,
          weights: i === 0 ? weights : opponentWeights });
        move = ['up', 'down', 'left', 'right'].indexOf(result.move);
      } else if (opponent.startsWith('http')) {
        const request = toRequest(view);
        const response = await fetch(`${opponent.replace(/\/$/, '')}/move`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
          signal: AbortSignal.timeout(500),
        });
        if (!response.ok) throw new Error(`Opponent returned HTTP ${response.status}`);
        move = ['up', 'down', 'left', 'right'].indexOf((await response.json()).move);
        if (move < 0) throw new Error('Opponent returned an invalid move');
      } else move = baseline(view, opponent, rng);
      if (i === 0) { const ms = performance.now() - before; maxMs = Math.max(maxMs, ms); totalMs += ms; calls++; }
      moves.push(move);
    }
    state = environment(step(state, moves), rng, safeBox);
    if (record) frames.push({ turn: state.turn, board: { width: 11, height: 11,
      snakes: state.snakes.filter(s => s.alive).map(s => ({ id: s.id, body: s.body.map(p => ({ x: p % 11, y: (p / 11) | 0 })) })),
      food: Array.from(state.food.keys()).filter(p => state.food[p]).map(p => ({ x: p % 11, y: (p / 11) | 0 })),
      hazards: Array.from(state.hazards.keys()).filter(p => state.hazards[p]).map(p => ({ x: p % 11, y: (p / 11) | 0 })),
    } });
  }
  const alive = state.snakes[0].alive, otherAlive = state.snakes.slice(1).some(s => s.alive);
  return { seed, opponent, mode, swap, outcome: alive && !otherAlive ? 'win' : !alive && otherAlive ? 'loss' : 'draw',
    turns: state.turn, maxMs, meanMs: totalMs / Math.max(1, calls), calls,
    ...(record ? { frames } : {}) };
}

export async function tournament(options) {
  const games = options.games ?? 20, seedStart = options.seed ?? 1;
  const outcomes = { wins: 0, losses: 0, draws: 0, games, maxMs: 0, meanMs: 0, decisions: 0 };
  const details = [];
  for (let i = 0; i < games; i++) {
    const result = await match({ ...options, seed: seedStart + (i / 2 | 0), swap: i % 2 === 1 });
    outcomes[result.outcome === 'win' ? 'wins' : result.outcome === 'loss' ? 'losses' : 'draws']++;
    outcomes.maxMs = Math.max(outcomes.maxMs, result.maxMs);
    outcomes.meanMs += result.meanMs * result.calls;
    outcomes.decisions += result.calls;
    details.push(result);
  }
  outcomes.meanMs /= Math.max(1, outcomes.decisions);
  outcomes.score = (outcomes.wins + 0.5 * outcomes.draws) / games;
  return { ...outcomes, details };
}

export function argumentsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error('Use --option value');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
