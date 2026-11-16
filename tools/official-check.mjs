import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chooseMove } from '../src/agent.mjs';
import { DIRECTIONS, fromRequest, step } from '../src/game.mjs';
import { baseline, argumentsOf, random } from './local-game.mjs';

const args = argumentsOf(process.argv.slice(2));
if (!args.engine) throw new Error('Pass --engine /absolute/path/to/official/battlesnake');
const engine = resolve(args.engine), mode = args.mode ?? 'standard', games = Number(args.games ?? 4);
const nodes = Number(args.nodes ?? 256), opponent = args.opponent ?? 'space';
const players = Number(args.players ?? 2);
if (![2, 4].includes(players)) throw new Error('Use 2 or 4 players');
const label = `${mode}-${players}p`;
await mkdir('results/official', { recursive: true });
const summary = { engine, mode, players, nodes, opponent, games, wins: 0, losses: 0, draws: 0, comparedTurns: 0, mismatches: [] };
for (let game = 0; game < games; game++) {
  const rng = random(7500 + game), turns = new Map();
  let finalRequest;
  const servers = [];
  async function listen(index) {
    const server = http.createServer(async (req, res) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      const request = text ? JSON.parse(text) : undefined;
      let response = { apiversion: '1', color: index ? '#f97316' : '#8b5cf6' };
      if (req.url === '/move') {
        let entry = turns.get(request.turn);
        if (!entry) { entry = { request, moves: {} }; turns.set(request.turn, entry); }
        const move = index === 0 ? chooseMove(request, { nodes }).move
          : DIRECTIONS[baseline(fromRequest(request), opponent, rng)];
        entry.moves[request.you.id] = move;
        response = { move };
      } else if (req.url === '/end') finalRequest = request;
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    const urls = [];
    for (let i = 0; i < players; i++) urls.push(await listen(i));
    const output = resolve(`results/official/${label}-${game}.jsonl`);
    const cli = ['play', '--seed', String(7500 + game), '--timeout', '500', '--width', '11', '--height', '11',
      '--gametype', mode, '--map', 'standard', '--output', output];
    for (let i = 0; i < players; i++) cli.push('--name', i ? `${opponent}-${i}` : 'Hill Serpent', '--url', urls[i]);
    let log = '';
    const code = await new Promise((resolve, reject) => {
      const child = spawn(engine, cli, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', x => { log += x; }); child.stderr.on('data', x => { log += x; });
      child.on('error', reject); child.on('exit', resolve);
    });
    if (code !== 0 || !finalRequest) throw new Error(`Official engine failed: ${log.slice(-2000)}`);
    const canonical = s => s.snakes.filter(x => x.alive).map(x => ({ id: x.id, health: x.health, body: x.body }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const canonicalRequest = request => request.board.snakes.map(x => ({ id: x.id, health: x.health,
      body: x.body.map(p => p.y * request.board.width + p.x) })).sort((a, b) => a.id.localeCompare(b.id));
    const frames = [...turns.values()].sort((a, b) => a.request.turn - b.request.turn);
    for (let i = 0; i < frames.length; i++) {
      const entry = frames[i], before = fromRequest(entry.request);
      // The CLI makes one final /move call before its game-over stage. With
      // one survivor it ends the game without applying the returned move.
      if (before.snakes.filter(s => s.alive).length <= 1) continue;
      const actual = canonicalRequest(i + 1 < frames.length ? frames[i + 1].request : finalRequest);
      const moves = before.snakes.map(s => DIRECTIONS.indexOf(entry.moves[s.id]));
      const predicted = step(before, moves);
      summary.comparedTurns++;
      if (JSON.stringify(canonical(predicted)) !== JSON.stringify(actual)) {
        summary.mismatches.push({ game, turn: entry.request.turn, predicted: canonical(predicted), actual });
      }
    }
    const survivors = finalRequest.board.snakes;
    const mine = frames[0].request.board.snakes.find(s => s.name === 'Hill Serpent')?.id;
    const win = survivors.length === 1 && survivors[0].id === mine;
    const loss = survivors.length === 1 && survivors[0].id !== mine;
    summary[win ? 'wins' : loss ? 'losses' : 'draws']++;
    console.log(JSON.stringify({ game, turns: frames.length, outcome: win ? 'win' : loss ? 'loss' : 'draw',
      mismatches: summary.mismatches.length }));
  } finally {
    await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))));
  }
}
await writeFile(`results/official-${label}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.mismatches.length) process.exitCode = 1;
