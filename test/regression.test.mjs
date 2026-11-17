import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseMove, Evaluator } from '../src/agent.mjs';
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
  for (const nodes of [256, 384, 512, 1024, 3200]) assert.equal(chooseMove(request, { nodes }).move, 'up');
});

test('real rematch opening: takes nearby safe food in two moves against every immediate reply', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/rematch-opening.json', import.meta.url)));
  const state = fromRequest(request);
  for (const nodes of [256, 384, 512, 1024, 3200]) {
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
  for (const nodes of [256, 384, 512, 1024, 3200]) {
    const move = DIRECTIONS.indexOf(chooseMove(request, { nodes }).move);
    const next = state.g.next[state.snakes[0].body[0] * 4 + move];
    assert.ok(legalMoves(state, 0).includes(move));
    assert.ok(distance({ x: next % 11, y: Math.floor(next / 11) }) < distance(request.you.head));
  }
});


test('Apprentice regression: avoids the four-step wall corridor', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-corridor.json', import.meta.url)));
  for (const nodes of [256, 384, 512, 1024, 3200]) {
    const result = chooseMove(request, { nodes });
    assert.equal(result.move, 'down');
    assert.equal(result.survival.up.trapped, true);
    assert.ok(result.survival.up.deepest <= 4);
    assert.ok(Object.values(result.survival).every(p => p.nodes <= 512));
  }
});

test('Apprentice regression: a reachable tail does not make a cramped pocket safe', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-pocket.json', import.meta.url)));
  for (const nodes of [256, 384, 512, 1024, 3200]) assert.equal(chooseMove(request, { nodes }).move, 'up');
});


test('Apprentice wall-cut: the shorter opponent can still seal the side exit with its neck', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-wall-cut.json', import.meta.url)));
  for (const nodes of [256, 384, 512, 1024, 3200]) {
    const result = chooseMove(request, { nodes });
    assert.equal(result.move, 'right');
    assert.equal(result.survival.left.kind, 'forced-replies');
    assert.ok(result.survival.left.replyNodes <= 256);
  }
});

test('Apprentice top-edge cut: exits before the opponent builds a moving body barrier', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-top-cut.json', import.meta.url)));
  for (const nodes of [256, 384, 512, 1024, 3200]) {
    const result = chooseMove(request, { nodes });
    assert.equal(result.move, 'down');
    assert.equal(result.survival.right.kind, 'forced-replies');
    assert.ok(result.survival.right.replyNodes <= 256);
  }
});

test('Apprentice long corridor: recognizes a dead end beyond the old twelve-step horizon', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-long-corridor.json', import.meta.url)));
  for (const nodes of [256, 384, 512, 1024, 3200]) {
    const result = chooseMove(request, { nodes });
    assert.equal(result.survival.down.trapped, true);
    assert.equal(result.survival.down.deepest, 14);
    assert.equal(result.move, 'up');
  }
});

test('Apprentice food race: moves toward the available meal instead of a meal the rival reaches first', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/apprentice-food-race.json', import.meta.url)));
  // Real turn 52: meal (1,4) is five steps away for us, one for the rival.
  // Meal (10,0) is eight steps for us and twelve for the rival.
  const available = { x: 10, y: 0 }, lost = { x: 1, y: 4 };
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const state = fromRequest(request);
  for (const nodes of [256, 384, 512, 1024, 3200]) {
    const result = chooseMove(request, { nodes });
    const p = state.g.next[state.snakes[0].body[0] * 4 + DIRECTIONS.indexOf(result.move)];
    const target = { x: p % 11, y: Math.floor(p / 11) };
    assert.ok(distance(target, available) < distance(request.you.head, available));
    assert.ok(distance(target, lost) > distance(request.you.head, lost));
  }
});


test('Journeyman regression: distant owned islands are not connected escape space', async () => {
  const request = JSON.parse(await readFile(new URL('./fixtures/journeyman-disconnected.json', import.meta.url)));
  const state = fromRequest(request), evaluator = new Evaluator(state.g, 2);
  evaluator.analyze(state);
  // Real turn 366, length 34: the old independent fills counted 53 cells.
  // Competitive propagation stops at the contested passage and counts 7.
  assert.equal(evaluator.areas[0], 7);
  assert.equal(evaluator.connectedSpace, 7);
  const old = new Evaluator(state.g, 2, { connectedSafety: 0 });
  assert.ok(evaluator.evaluate(state) < old.evaluate(state) - 150);
});
