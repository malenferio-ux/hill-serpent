import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseMove } from '../src/agent.mjs';
import { fixture } from './helpers.mjs';
import { fromRequest, toRequest, step, legalMoves, DIRECTIONS } from '../src/game.mjs';

test('takes safe adjacent food while substantially shorter than its opponent', () => {
  const request = fixture({
    bodies: [[12, 11, 0], [108, 109, 120, 119, 118, 117, 116, 115, 114]],
    food: [13, 60, 107],
  });
  assert.equal(chooseMove(request, { nodes: 256 }).move, 'right');
});

test('leaves the boundary before the real Novice-game corridor closes', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/novice-turn-342.json', import.meta.url)));
  assert.equal(chooseMove(request, { nodes: 256 }).move, 'up');
});

test('real Novice-game regression: takes the open exit instead of the bottom food trap', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/novice-turn-344.json', import.meta.url)));
  for (const nodes of [256, 3200]) assert.equal(chooseMove(request, { nodes }).move, 'up');
});

test('real rematch opening: takes nearby safe food in two moves against every immediate reply', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/rematch-opening.json', import.meta.url)));
  const state = fromRequest(request);
  for (const nodes of [256, 3200]) {
    const first = DIRECTIONS.indexOf(chooseMove(request, { nodes }).move);
    for (const reply of legalMoves(state, 1)) {
      const next = step(state, [first, reply]);
      const second = DIRECTIONS.indexOf(chooseMove(toRequest(next), { nodes }).move);
      for (const reply2 of legalMoves(next, 1)) {
        const result = step(next, [second, reply2]);
        assert.ok(result.snakes[0].alive);
        assert.equal(result.snakes[0].body.length, 4);
      }
    }
  }
});

test('real rematch regression: leaves the central loop toward food', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/rematch-turn-11.json', import.meta.url)));
  const distance = p => Math.min(...request.board.food.map(f => Math.abs(p.x - f.x) + Math.abs(p.y - f.y)));
  const state = fromRequest(request);
  for (const nodes of [256, 3200]) {
    const move = DIRECTIONS.indexOf(chooseMove(request, { nodes }).move);
    const next = state.g.next[state.snakes[0].body[0] * 4 + move];
    assert.ok(legalMoves(state, 0).includes(move));
    assert.ok(distance({ x: next % 11, y: Math.floor(next / 11) }) < distance(request.you.head));
  }
});


test('Apprentice regression: avoids the four-step wall corridor', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-corridor.json', import.meta.url)));
  for (const nodes of [256, 3200]) {
    const result = chooseMove(request, { nodes });
    if (nodes === 256) assert.equal(result.move, 'down');
    assert.equal(result.survival.up.trapped, true);
    assert.ok(result.survival.up.deepest <= 4);
    assert.ok(Object.values(result.survival).every(p => p.nodes <= 128));
  }
});

test('Apprentice regression: a reachable tail does not make a cramped pocket safe', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-pocket.json', import.meta.url)));
  for (const nodes of [256, 3200]) assert.equal(chooseMove(request, { nodes }).move, 'up');
});
