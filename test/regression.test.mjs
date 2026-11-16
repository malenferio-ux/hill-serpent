import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseMove } from '../src/agent.mjs';
import { fixture } from './helpers.mjs';

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
