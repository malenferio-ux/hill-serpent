import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {argumentsOf} from './local-game.mjs';
import {chooseMove as current} from '../src/agent.mjs';
const args=argumentsOf(process.argv.slice(2));
if(!args.games)throw Error('Pass --games docs/apprentice-1.6.1.json');
const chooseMove=args['baseline-dir']?(await import(pathToFileURL(resolve(args['baseline-dir'],'src/agent.mjs')))).chooseMove:current;
const engine=args.engine==='wasm'?(await import(pathToFileURL(resolve(args['baseline-dir']??'.','src/duel-node.mjs')))).duelEngine:null;
const workBudget=Number(args['work-budget']??1000000);
const nodes=Number(args.nodes??(engine?40000:512)),width=Number(args.width??11),height=Number(args.height??11);
const entries=JSON.parse(await readFile(args.games,'utf8')),rows=[];
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Arena HTTP '+r.status);return r.json();};
for(const entry of entries){
  const id=typeof entry==='string'?entry.split('/').at(-1):entry.id;
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid game id');
  let frames;
  if(args['frames-dir'])frames=JSON.parse(await readFile(resolve(args['frames-dir'],id+'-frames.json'),'utf8'));
  else{
    const metadata=await get('https://arena.battlesnake.com/api/games/'+id);
    if(metadata.Game.Status!=='complete')throw Error('Game not complete: '+id);
    frames=[];
    for(let offset=0;offset<=metadata.LastFrame.Turn;offset+=100){
      const page=await get('https://arena.battlesnake.com/api/games/'+id+'/frames?offset='+offset);
      frames.push(...page.Frames);
    }
    if(frames.length!==metadata.LastFrame.Turn+1)throw Error('Incomplete replay '+id);
  }
  const row={id,moves:frames.length-1,compared:0,httpFailures:0,maxMs:0,mismatches:[]};
  for(let t=0;t<frames.length-1;t++){
    const f=frames[t],point=p=>({x:p.X,y:p.Y});
    const snakes=f.Snakes.filter(s=>!s.Death&&!s.EliminatedCause).map(s=>({id:s.ID,name:s.Name,health:s.Health,body:s.Body.map(point),head:point(s.Body[0]),length:s.Body.length}));
    const you=snakes.find(s=>s.name===(args.name??'Hill Serpent'));
    if(!you)throw Error('Our live snake missing at turn '+t);
    const response=frames[t+1].Snakes.find(s=>s.ID===you.id);
    row.maxMs=Math.max(row.maxMs,Number(response.Latency));
    if(response.Error||(response.StatusCode&&response.StatusCode!==200)){row.httpFailures++;continue;}
    const request={game:{id,timeout:500,ruleset:{name:'standard',settings:{hazardDamagePerTurn:15}}},turn:f.Turn,board:{width,height,snakes,food:f.Food.map(point),hazards:f.Hazards.map(point)},you};
    const next=response.Body[0],dx=next.X-you.head.x,dy=next.Y-you.head.y;
    const actual=dx===0&&dy===1?'up':dx===0&&dy===-1?'down':dx===-1&&dy===0?'left':dx===1&&dy===0?'right':undefined;
    const result=chooseMove(request,{nodes,...(engine?{depth:12,workBudget,searchEngine:engine.search,survivalEngine:engine.guards}:{})});row.compared++;
    if(actual!==result.move)row.mismatches.push({turn:f.Turn,actual,chosen:result.move});
  }
  rows.push(row);console.log(JSON.stringify({id,compared:row.compared,httpFailures:row.httpFailures,mismatches:row.mismatches.length}));
}
const report={nodes,engine:engine?'wasm':'js',workBudget:engine?workBudget:0,mode:'standard',width,height,games:rows.length,moves:rows.reduce((s,r)=>s+r.moves,0),compared:rows.reduce((s,r)=>s+r.compared,0),httpFailures:rows.reduce((s,r)=>s+r.httpFailures,0),mismatches:rows.reduce((s,r)=>s+r.mismatches.length,0),maxMs:Math.max(...rows.map(r=>r.maxMs)),rows};
await mkdir('results',{recursive:true});await writeFile('results/replay.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined}));
if(report.mismatches||report.httpFailures)process.exitCode=1;
