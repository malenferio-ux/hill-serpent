import { mkdir, writeFile } from 'node:fs/promises';
import { DEFAULT_WEIGHTS } from '../src/agent.mjs';
import { tournament, random, argumentsOf } from './local-game.mjs';

const args = argumentsOf(process.argv.slice(2));
const candidates = Number(args.candidates ?? 12), games = Number(args.games ?? 8);
const nodes = Number(args.nodes ?? 256), seed = Number(args.seed ?? 1000);
const rng = random(987654321), history = [];
let champion = { ...DEFAULT_WEIGHTS };
async function evaluate(weights, heldout = false) {
  const records = [];
  for (const opponent of ['space', 'hunter', 'search']) {
    const result = await tournament({ weights, opponent, nodes, games: heldout ? games * 2 : games,
      opponentNodes: 128, seed: heldout ? seed + 100000 : seed, maxTurns: 350 });
    const { details, ...summary } = result;
    records.push({ opponent, ...summary });
  }
  return { score: records.reduce((sum, r) => sum + r.score, 0) / records.length, records };
}
let best = await evaluate(champion);
history.push({ candidate: 0, accepted: true, weights: champion, ...best });
console.log(JSON.stringify(history[0]));
const keys = Object.keys(champion);
for (let i = 1; i <= candidates; i++) {
  // One-coordinate mutation keeps changes interpretable.
  const key = keys[(rng() * keys.length) | 0];
  const weights = { ...champion, [key]: Math.max(0.01, champion[key] * (rng() < 0.5 ? 0.65 : 1.5)) };
  const evaluation = await evaluate(weights);
  const accepted = evaluation.score > best.score;
  history.push({ candidate: i, changed: key, accepted, weights, ...evaluation });
  console.log(JSON.stringify(history.at(-1)));
  if (accepted) { champion = weights; best = evaluation; }
}
const heldoutBaseline = await evaluate(DEFAULT_WEIGHTS, true);
const heldoutChampion = await evaluate(champion, true);
const validationAccepted = heldoutChampion.score > heldoutBaseline.score;
const selected = validationAccepted ? champion : { ...DEFAULT_WEIGHTS };
await mkdir('results', { recursive: true });
await writeFile('results/champion.json', JSON.stringify(selected, null, 2));
await writeFile('results/tuning.json', JSON.stringify({ nodes, seed, games, candidates,
  history, trainingChampion: champion, champion: selected, validationAccepted, heldoutBaseline, heldoutChampion,
  warning: 'Local original sparring partners only; this is not an arena ranking or a test against the four course snakes.' }, null, 2));
console.log(JSON.stringify({ champion: selected, validationAccepted, heldoutBaseline, heldoutChampion }, null, 2));
