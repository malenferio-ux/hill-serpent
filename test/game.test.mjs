import test from 'node:test';
import assert from 'node:assert/strict';
import { step, legalMoves, fromRequest, toRequest } from '../src/game.mjs';
import { fixture, state } from './helpers.mjs';

test('all snakes move simultaneously and inputs remain unchanged', () => {
  const s = state(), before = JSON.stringify(s);
  const next = step(s, [0, 1]);
  assert.deepEqual(next.snakes[0].body, [23, 12, 11]);
  assert.equal(next.snakes[0].health, 99);
  assert.equal(JSON.stringify(s), before);
});

test('unique tail vacates even when eating; growth duplicates the NEW tail', () => {
  const s = state({ width: 5, height: 5, bodies: [[6, 7, 12, 11]], food: [11] });
  assert.ok(legalMoves(s, 0).includes(0));
  const next = step(s, [0]);
  assert.equal(next.snakes[0].alive, true);
  assert.deepEqual(next.snakes[0].body, [11, 6, 7, 12, 12]);
  assert.equal(next.food[11], 0);
});

test('stacked tail does not vacate', () => {
  const s = state({ width: 5, height: 5, bodies: [[6, 7, 12, 11, 11]] });
  assert.ok(!legalMoves(s, 0).includes(0));
  assert.equal(step(s, [0]).snakes[0].alive, false);
});

test('larger head survives; equal heads both die', () => {
  for (const equal of [false, true]) {
    const bodies = [[6, 5, 0], equal ? [8, 9, 4] : [8, 9, 4, 3]];
    const next = step(state({ width: 5, height: 5, bodies }), [3, 2]);
    assert.equal(next.snakes[0].alive, false);
    assert.equal(next.snakes[1].alive, !equal);
  }
});

test('food is consumed by both colliding heads before length comparison', () => {
  const next = step(state({ width: 5, height: 5, bodies: [[6, 5, 0], [8, 9, 4, 3]], food: [7] }), [3, 2]);
  assert.equal(next.snakes[0].body.length, 4);
  assert.equal(next.snakes[1].body.length, 5);
  assert.equal(next.snakes[1].alive, true);
});

test('food rescues health=1 and neutralizes hazard damage', () => {
  const next = step(state({ bodies: [[12, 11, 0]], health: [1], food: [23], hazards: [23] }), [0]);
  assert.equal(next.snakes[0].health, 100);
  assert.equal(next.snakes[0].alive, true);
});

test('hazard damage stacks and can kill', () => {
  const next = step(state({ bodies: [[12, 11, 0]], health: [28], hazards: [23, 23] }), [0]);
  assert.equal(next.snakes[0].alive, false);
});

test('wall and body collisions kill independently', () => {
  assert.equal(step(state({ bodies: [[0, 1, 2]] }), [2]).snakes[0].alive, false);
  assert.equal(step(state({ width: 5, height: 5, bodies: [[6, 7, 12, 11, 10]] }), [0]).snakes[0].alive, false);
});

test('body of a starved snake disappears before collision detection', () => {
  const s = state({ width: 5, height: 5, bodies: [[6, 5, 0], [12, 11, 10]], health: [100, 1] });
  const next = step(s, [0, 3]);
  assert.equal(next.snakes[0].alive, true);
  assert.equal(next.snakes[1].alive, false);
});

test('body of a collision victim still participates in the same turn', () => {
  const s = state({ width: 5, height: 5, bodies: [[6, 5, 0], [11, 12, 13, 8]] });
  const next = step(s, [0, 3]);
  assert.equal(next.snakes[0].alive, false);
  assert.equal(next.snakes[1].alive, false);
});

test('Constrictor grows each turn and keeps health at 100', () => {
  let s = state({ bodies: [[12, 11, 11]], rule: 'constrictor' });
  s = step(s, [0]);
  assert.deepEqual(s.snakes[0].body, [23, 12, 11, 11]);
  assert.equal(s.snakes[0].health, 100);
  s = step(s, [0]);
  assert.equal(s.snakes[0].body.length, 5);
});

test('reorders you to index zero and roundtrips API coordinates', () => {
  const request = fixture(); request.you = request.board.snakes[1];
  const s = fromRequest(request);
  assert.equal(s.snakes[0].id, 's1');
  assert.deepEqual(fromRequest(toRequest(s)).snakes, s.snakes);
});
