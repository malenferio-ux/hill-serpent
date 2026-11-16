import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { tournament, argumentsOf } from './local-game.mjs';

const args = argumentsOf(process.argv.slice(2));
const weights = args.weights ? JSON.parse(await readFile(args.weights, 'utf8')) : undefined;
const opponentWeights = args['opponent-weights'] ? JSON.parse(await readFile(args['opponent-weights'], 'utf8')) : undefined;
const options = { games: Number(args.games ?? 20), seed: Number(args.seed ?? 1),
  opponent: args.opponent ?? 'space', mode: args.mode ?? 'duel', nodes: Number(args.nodes ?? 256),
  maxTurns: Number(args.turns ?? 500), opponentNodes: Number(args['opponent-nodes'] ?? 128), weights, opponentWeights };
if (!Number.isInteger(options.games) || options.games < 1 || options.games > 10000) throw new Error('Invalid number of games');
if (options.opponent.startsWith('http')) console.log('Using a real HTTP opponent; each request has a 500 ms timeout.');
const result = await tournament(options);
await mkdir('results', { recursive: true });
const path = args.out ?? `results/${options.mode}-${options.opponent.startsWith('http') ? 'remote' : options.opponent}.json`;
await writeFile(path, JSON.stringify({ options, ...result }, null, 2));
const { details, ...summary } = result;
console.log(JSON.stringify({ ...summary, path }, null, 2));
