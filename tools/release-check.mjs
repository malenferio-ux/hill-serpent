import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {decide as challenger} from '../src/agent.mjs';
import {start,perspective,environment,random,baseline,argumentsOf} from './local-game.mjs';
import {step,DIRECTIONS} from '../src/game.mjs';
const args=argumentsOf(process.argv.slice(2));
if(!args['baseline-dir'])throw new Error('Pass --baseline-dir /path/to/previous-release-checkout');
const {decide:legacy}=await import(pathToFileURL(resolve(args['baseline-dir'],'src/agent.mjs')));
async function series({games=16,seed=4100000,weights={},mode='duel',opponent='legacy',nodes=256,opponentNodes=nodes,challengerFn=challenger,opponentFn=legacy}){
 const out={games,seed,weights,mode,opponent,nodes,baselineNodes:opponentNodes,wins:0,losses:0,draws:0,turns:0,calls:0,totalMs:0,maxMs:0,loopTurns:0,opponentLoopTurns:0,firstFoodTurns:0,opponentFirstFoodTurns:0,finalLength:0};
 for(let i=0;i<games;i++){
  const gameSeed=seed+(i/2|0);let s=start(gameSeed,mode);if(i%2)[s.snakes[0].body,s.snakes[1].body]=[s.snakes[1].body,s.snakes[0].body];
  const rng=random(gameSeed^0xA5A5A5A5),box=[0,10,0,10],history=[],enemyHistory=[];let firstFood=-1,enemyFirstFood=-1;
  while(s.turn<700&&s.snakes[0].alive&&s.snakes.slice(1).some(s=>s.alive)){
   const me=s.snakes[0],enemy=s.snakes[1];if(firstFood<0&&me.body.length>3)firstFood=s.turn;
   if(enemyFirstFood<0&&enemy.body.length>3)enemyFirstFood=s.turn;
   if(enemyHistory.slice(-12,-3).some(h=>h.head===enemy.body[0]&&h.length===enemy.body.length))out.opponentLoopTurns++;
   enemyHistory.push({head:enemy.body[0],length:enemy.body.length});
   if(history.slice(-12,-3).some(h=>h.head===me.body[0]&&h.length===me.body.length))out.loopTurns++;
   history.push({head:me.body[0],length:me.body.length});
   const moves=[];
   for(let j=0;j<s.snakes.length;j++){
    if(!s.snakes[j].alive){moves.push(0);continue;}
    const view=perspective(s,j);let m;
    if(j===0){const begin=performance.now();m=DIRECTIONS.indexOf(challengerFn(view,{nodes,weights}).move);const ms=performance.now()-begin;out.calls++;out.totalMs+=ms;out.maxMs=Math.max(out.maxMs,ms);}
    else if(opponent==='legacy')m=DIRECTIONS.indexOf(opponentFn(view,{nodes:opponentNodes}).move);
    else m=baseline(view,opponent,rng);
    moves.push(m);
   }
   s=environment(step(s,moves),rng,box);
  }
  const me=s.snakes[0].alive,other=s.snakes.slice(1).some(s=>s.alive);out[me&&!other?'wins':!me&&other?'losses':'draws']++;
  out.turns+=s.turn;out.opponentFirstFoodTurns+=enemyFirstFood<0?s.turn:enemyFirstFood;out.firstFoodTurns+=firstFood<0?s.turn:firstFood;out.finalLength+=s.snakes[0].body.length;
 }
 out.score=(out.wins+.5*out.draws)/games;out.meanMs=out.totalMs/out.calls;out.loopRate=out.loopTurns/out.turns;out.meanFirstFood=out.firstFoodTurns/games;out.meanFinalLength=out.finalLength/games;out.opponentLoopRate=out.opponentLoopTurns/out.turns;out.opponentMeanFirstFood=out.opponentFirstFoodTurns/games;delete out.totalMs;return out;
}
const result=await series({games:Number(args.games??64),seed:Number(args.seed??15100000),nodes:Number(args.nodes??256),opponentNodes:Number(args['baseline-nodes']??args.nodes??256),mode:args.mode??'duel',opponent:args.opponent??'legacy'});
result.note='Local comparison with supplied baseline, reported main-search node limits and paired swapped starts; the current agent may also use bounded survival and opponent-reply probes. Loop = same head cell within 4–12 turns without growth.';
await mkdir('results',{recursive:true});
await writeFile('results/release-comparison.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
