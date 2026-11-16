import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.mjs';
import { createServer } from '../src/server.mjs';
import { fixture } from './helpers.mjs';

test('Worker implements the complete Battlesnake webhook contract', async () => {
  const info = await handle(new Request('https://snake.test/'));
  assert.equal((await info.json()).apiversion, '1');
  for (const path of ['start', 'end']) {
    assert.equal((await handle(new Request(`https://snake.test/${path}`, { method: 'POST', body: '{}' }))).status, 200);
  }
  const result = await handle(new Request('https://snake.test/move', { method: 'POST', body: JSON.stringify(fixture({ food: [60] })) }));
  assert.equal(result.status, 200);
  assert.ok(['up', 'down', 'left', 'right'].includes((await result.json()).move));
});

test('rejects malformed and oversized requests', async () => {
  for (const body of ['{', '{}', ' '.repeat(131073)]) {
    const response = await handle(new Request('https://snake.test/move', { method: 'POST', body }));
    assert.ok([400, 413].includes(response.status));
  }
  assert.equal((await handle(new Request('https://snake.test/nope'))).status, 404);
});

test('real HTTP server handles concurrent moves without shared state', async t => {
  const server = createServer({ SEARCH_NODES: '256' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const food = fixture({ health: [1, 100], food: [23] });
  const results = await Promise.all(Array.from({ length: 6 }, async () => {
    const response = await fetch(`${url}/move`, { method: 'POST', body: JSON.stringify(food) });
    return response.json();
  }));
  assert.ok(results.every(x => x.move === 'up'));
});
