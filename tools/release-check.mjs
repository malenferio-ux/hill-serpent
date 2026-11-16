import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {decide as challenger} from '../src/agent.mjs';
const baselineIndex=process.argv.indexOf('--baseline-dir');
if(baselineIndex<0||!process.argv[baselineIndex+1])throw new Error('Pass --baseline-dir /path/to/checkout-of-1.0.0');
const {decide:legacy}=await import(pathToFileURL(resolve(process.argv[baselineIndex+1],'src/agent.mjs')));
import {start,perspective,environment,random,baseline} from './local-game.mjs';
import {step,DIRECTIONS} from '../src/game.mjs';
async function series({games=24,seed=1000000,safety=1,mode='duel',opponent='legacy',nodes=256}){
 const summary={games,seed,safety,mode,opponent,nodes,wins:0,losses:0,draws:0,turns:0,calls:0,totalMs:0,maxMs:0,totalOurLength:0,totalOtherLength:0};
 for(let i=0;i<games;i++){
  const gameSeed=seed+(i/2|0);let s=start(gameSeed,mode);if(i%2)[s.snakes[0].body,s.snakes[1].body]=[s.snakes[1].body,s.snakes[0].body];
  const rng=random(gameSeed^0xA5A5A5A5),box=[0,10,0,10];
  while(s.turn<700&&s.snakes[0].alive&&s.snakes.slice(1).some(s=>s.alive)){
   const moves=[];
   for(let j=0;j<s.snakes.length;j++){
    if(!s.snakes[j].alive){moves.push(0);continue;}
    const view=perspective(s,j);let m;
    if(j===0){const begin=performance.now();m=DIRECTIONS.indexOf(challenger(view,{nodes,weights:{staticSafety:safety}}).move);const ms=performance.now()-begin;summary.calls++;summary.totalMs+=ms;summary.maxMs=Math.max(summary.maxMs,ms);}
    else if(opponent==='legacy')m=DIRECTIONS.indexOf(legacy(view,{nodes}).move);
    else m=baseline(view,opponent,rng);
    moves.push(m);
   }
   s=environment(step(s,moves),rng,box);
  }
  const me=s.snakes[0].alive,other=s.snakes.slice(1).some(s=>s.alive);summary[me&&!other?'wins':!me&&other?'losses':'draws']++;
  summary.turns+=s.turn;summary.totalOurLength+=s.snakes[0].body.length;summary.totalOtherLength+=s.snakes[1].body.length;
 }
 summary.score=(summary.wins+.5*summary.draws)/games;summary.meanMs=summary.totalMs/summary.calls;summary.meanTurns=summary.turns/games;summary.meanOurLength=summary.totalOurLength/games;summary.meanOtherLength=summary.totalOtherLength/games;delete summary.totalMs;return summary;
}
const result=await series({games:32,seed:2300000,safety:.5,opponent:'legacy',nodes:256});
await mkdir('results',{recursive:true});
await writeFile('results/release-comparison.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
