import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMove, Evaluator } from '../src/agent.mjs';
import { fixture } from './helpers.mjs';
import { fromRequest, legalMoves, step, DIRECTIONS } from '../src/game.mjs';

test('takes the only food before starvation', () => {
  const request = fixture({ bodies: [[12, 11, 0], [108, 109, 120]], health: [1, 100], food: [23] });
  assert.equal(chooseMove(request, { nodes: 256 }).move, 'up');
});

test('avoids an immediate losing head-to-head in every budget profile', () => {
  const request = fixture({ width: 5, height: 5, bodies: [[6, 5, 0], [8, 9, 14, 19]], food: [7, 16] });
  for (const nodes of [64, 256, 3200]) assert.notEqual(chooseMove(request, { nodes }).move, 'right');
});

test('selects a survivable move when holding a length advantage', () => {
  const request = fixture({ width: 5, height: 5, bodies: [[6, 5, 0, 1], [8, 9, 4]], food: [] });
  // Opponent can avoid the middle here: no false forced-win claims.
  const result = chooseMove(request, { nodes: 3200 });
  assert.ok(['up', 'right'].includes(result.move));
});

test('deterministic search honors the work budget and never mutates a request', () => {
  const request = fixture({ food: [60, 24, 96] }), before = JSON.stringify(request);
  const a = chooseMove(request, { nodes: 128 }), b = chooseMove(request, { nodes: 128 });
  assert.deepEqual(a, b);
  assert.ok(a.nodes <= 128);
  assert.equal(JSON.stringify(request), before);
});

test('supports Royale, Constrictor and four-snake requests', () => {
  for (const rule of ['royale', 'constrictor', 'standard']) {
    const request = fixture({ rule, bodies: [[12, 12, 12], [108, 108, 108], [20, 20, 20], [100, 100, 100]], food: [60] });
    const result = chooseMove(request, { nodes: 256 });
    assert.ok(['up', 'down', 'left', 'right'].includes(result.move));
    assert.ok(result.nodes <= 256);
  }
});

// An unpruned tree is an independent oracle for the ordering optimization.
test('cached move ordering agrees with exhaustive simultaneous minimax', () => {
  const requests = [
    fixture({ width: 5, height: 5, bodies: [[6, 5, 0], [18, 19, 24]], food: [12, 8] }),
    fixture({ width: 5, height: 5, bodies: [[6, 5, 0, 1], [8, 9, 14, 19]], food: [7, 16] }),
  ];
  for (const request of requests) {
    const state = fromRequest(request), evaluator = new Evaluator(state.g, 2, { foodProgress: 0 });
    function plain(s, depth, ply) {
      if (!depth || !s.snakes[0].alive || !s.snakes[1].alive) return evaluator.evaluate(s, ply);
      let best = -Infinity;
      for (const a of legalMoves(s, 0)) {
        let worst = Infinity;
        for (const b of legalMoves(s, 1)) worst = Math.min(worst, plain(step(s, [a, b]), depth - 1, ply + 1));
        best = Math.max(best, worst);
      }
      return best;
    }
    const values = legalMoves(state, 0).map(a => {
      let worst = Infinity;
      for (const b of legalMoves(state, 1)) worst = Math.min(worst, plain(step(state, [a, b]), 2, 1));
      return { move: DIRECTIONS[a], score: worst };
    });
    const best = Math.max(...values.map(x => x.score));
    const actual = chooseMove(request, { nodes: 40000, depth: 3, soloGuard: false, weights: { foodProgress: 0 } });
    assert.ok(Math.abs(actual.score - best) < 1e-7);
    assert.ok(values.some(x => x.move === actual.move && Math.abs(x.score - best) < 1e-7));
  }
});


test('equal-length enemy blocks the shared passage; a longer head can contest it', () => {
  const equal = fromRequest(fixture({ width: 3, height: 3, bodies: [[3, 3, 3], [5, 5, 5]] }));
  const longer = fromRequest(fixture({ width: 3, height: 3, bodies: [[3, 3, 3, 3], [5, 5, 5]] }));
  const a = new Evaluator(equal.g, 2), b = new Evaluator(longer.g, 2);
  a.analyze(equal); b.analyze(longer);
  assert.equal(a.connectedSpace, 3);
  assert.ok(b.connectedSpace > a.connectedSpace);
});
