import os from 'node:os';
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chooseMove } from '../src/agent.mjs';
import { toRequest, step, legalMoves } from '../src/game.mjs';
import { start, environment, random, argumentsOf } from './local-game.mjs';

const args = argumentsOf(process.argv.slice(2));
const iterations = Number(args.iterations ?? 120);
const samplingStride = Math.max(1, Number(args.stride ?? 1) | 0);
const samples = [];
for (const mode of ['duel', 'standard', 'royale', 'constrictor']) {
  let state = start(42, mode); const rng = random(4321), box = [0, 10, 0, 10];
  for (let t = 0; t < 30; t++) {
    if (state.snakes[0].alive) samples.push({ mode, request: toRequest(state) });
    const moves = state.snakes.map((s, i) => s.alive ? legalMoves(state, i)[(rng() * legalMoves(state, i).length) | 0] : 0);
    state = environment(step(state, moves), rng, box);
  }
}
const rows = [];
if (args.corpus) {
  const raw = await readFile(args.corpus);
  const corpus = JSON.parse((args.corpus.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  for (const request of corpus) samples.push({ mode: request.game.ruleset.name, request });
}
const budgets = String(args.budgets ?? '128,256,512,1024,3200,6400').split(',').map(Number);
if (budgets.some(n => !Number.isFinite(n) || n < 64)) throw new Error('Invalid --budgets list');
for (const nodes of budgets) {
  // Cold measurements precede a short warmup. All decisions run serially.
  const cold = performance.now(); chooseMove(samples[0].request, { nodes });
  const coldMs = performance.now() - cold;
  for (let i = 0; i < 20; i++) chooseMove(samples[i % samples.length].request, { nodes });
  const times = [], cpu = process.cpuUsage();
  for (let i = 0; i < iterations; i++) {
    const before = performance.now();
    chooseMove(samples[(i * samplingStride) % samples.length].request, { nodes });
    times.push(performance.now() - before);
  }
  const used = process.cpuUsage(cpu);
  times.sort((a, b) => a - b);
  rows.push({ nodes, samples: iterations, coldMs,
    meanMs: times.reduce((sum, t) => sum + t, 0) / times.length,
    p50Ms: times[(times.length * 0.5) | 0], p95Ms: times[(times.length * 0.95) | 0],
    maxMs: times.at(-1), cpuMsPerMove: (used.user + used.system) / 1000 / iterations });
}
const result = { machine: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, node: process.version },
  singleDecisionThread: true, v8Flags: process.execArgv,
  positions: samples.length, samplingStride, note: 'Local timing is not a production Cloudflare CPU measurement or network latency guarantee.', rows };
await mkdir('results', { recursive: true });
await writeFile('results/latency.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (rows.some(row => row.maxMs >= 500)) process.exitCode = 1;
