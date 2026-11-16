import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMove } from '../src/agent.mjs';
import { fixture } from './helpers.mjs';

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
