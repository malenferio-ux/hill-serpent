import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {duelEngine} from '../src/duel-node.mjs';
import {chooseMove,Evaluator,decide} from '../src/agent.mjs';
import {fromRequest,legalMoves,step,toRequest} from '../src/game.mjs';
import {start,environment,random} from '../tools/local-game.mjs';
import {handle} from '../src/worker.mjs';

const accelerated={searchEngine:duelEngine.search,survivalEngine:duelEngine.guards};
const requests=[];
for(const file of await readdir(new URL('./fixtures/',import.meta.url))){
 if(!file.endsWith('.json'))continue;
 const r=JSON.parse(await readFile(new URL('./fixtures/'+file,import.meta.url)));
 if(r.board?.snakes.length===2&&r.game?.ruleset?.name==='standard'&&!r.board.hazards?.length)requests.push(r);
}
const states=requests.map(fromRequest);
for(let seed=0;seed<8;seed++){
 let s=start(20100000+seed),rng=random(seed),box=[0,10,0,10];
 for(let t=0;t<75&&s.snakes.every(x=>x.alive);t++){
  if(t%5===0)states.push(s);
  const moves=s.snakes.map((_,i)=>{const m=legalMoves(s,i);return m[Math.floor(rng()*m.length)];});
  s=environment(step(s,moves),rng,box);
 }
}

test('Wasm state transitions and evaluation agree with the independent JS simulator',()=>{
 let transitions=0;
 for(const s of states){
  assert.ok(Math.abs(duelEngine.evaluate(s)-new Evaluator(s.g,2).evaluate(s))<1e-7);
  for(const own of legalMoves(s,0))for(const other of legalMoves(s,1)){
   const a=step(s,[own,other]),b=duelEngine.transition(s,[own,other]);
   assert.deepEqual(b.food,Array.from(a.food));
   for(let i=0;i<2;i++)assert.deepEqual(b.snakes[i],{len:a.snakes[i].body.length,health:a.snakes[i].health,alive:a.snakes[i].alive,body:a.snakes[i].body});
   transitions++;
  }
 }
 assert.ok(transitions>100);
});

test('Wasm search and survival proofs agree with JS on independent positions',()=>{
 for(const s of states)for(const nodes of[64,384,1536]){
  const a=decide(s,{nodes}),b=decide(s,{nodes,...accelerated});
  assert.equal(b.move,a.move);assert.equal(b.depth,a.depth);assert.ok(Math.abs(b.score-a.score)<1e-7);assert.deepEqual(b.survival,a.survival);
 }
});

test('Work-limited engine stays bounded and is repeatable across interleaved requests',()=>{
 for(const s of states.slice(0,20)){
  const opts={nodes:40000,depth:12,workBudget:1000000,...accelerated},a=decide(s,opts);
  decide(states.at(-1),opts);const b=decide(s,opts);
  assert.deepEqual(a,b);assert.ok(a.nodes<=40000);assert.ok(a.depth<=12);
  if(a.work)assert.ok(a.work<1015000);
 }
});

test('HTTP handler uses the accelerated profile and retains JS for unsupported modes',async()=>{
 const request=toRequest(start(981));
 const env={SEARCH_NODES:256,DUEL_SEARCH_NODES:40000,DUEL_WORK_BUDGET:1000000,JS_DUEL_SEARCH_NODES:384};
 const response=await handle(new Request('http://localhost/move',{method:'POST',body:JSON.stringify(request)}),env,duelEngine);
 assert.equal(response.status,200);
 assert.equal((await response.json()).move,chooseMove(request,{nodes:40000,depth:12,workBudget:1000000,...accelerated}).move);
 const royale=toRequest(start(882,'royale'));
 const r=await handle(new Request('http://localhost/move',{method:'POST',body:JSON.stringify(royale)}),env,duelEngine);
 assert.equal((await r.json()).move,chooseMove(royale,{nodes:256}).move);
});
