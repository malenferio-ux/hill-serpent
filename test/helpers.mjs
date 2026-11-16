import { fromRequest } from '../src/game.mjs';

export function fixture({ width = 11, height = 11, bodies = [[12, 11, 0], [108, 109, 120]],
  health = [], food = [], hazards = [], rule = 'standard', hazardDamage = 14 } = {}) {
  const point = p => ({ x: p % width, y: (p / width) | 0 });
  const snakes = bodies.map((body, i) => ({ id: `s${i}`, name: `s${i}`, health: health[i] ?? 100,
    body: body.map(point), head: point(body[0]), length: body.length }));
  return { game: { id: 'test', timeout: 500, ruleset: { name: rule, settings: { hazardDamagePerTurn: hazardDamage } } },
    turn: 0, board: { width, height, snakes, food: food.map(point), hazards: hazards.map(point) }, you: snakes[0] };
}

export function state(options) { return fromRequest(fixture(options)); }
