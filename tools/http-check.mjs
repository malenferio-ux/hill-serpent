import{readFile,writeFile,mkdir}from'node:fs/promises';
import{start,argumentsOf}from'./local-game.mjs';
import{toRequest}from'../src/game.mjs';
import{chooseMove}from'../src/agent.mjs';
import{DETAILS}from'../src/worker.mjs';
const args=argumentsOf(process.argv.slice(2));
const url=String(args.url??'https://hill-serpent.pages.dev').replace(/\/$/,'');
const timeout=Number(args.timeout??500),baseNodes=Number(args.nodes??256),expectedVersion=args.version??DETAILS.version;
const report={url,expectedVersion,timeoutMs:timeout,checkedAt:new Date().toISOString(),metadata:null,metadataError:null,rows:[]};
try{const r=await fetch(url+'/',{signal:AbortSignal.timeout(5000)});report.metadata=await r.json();if(!r.ok||report.metadata.version!==expectedVersion)report.metadataError='Unexpected metadata/version';}catch(e){report.metadataError=e.name+': '+e.message;}
const requests=[];for(const mode of['duel','standard','royale','constrictor'])for(let i=0;i<6;i++)requests.push(toRequest(start(18100000+i,mode)));
for(const name of['novice-turn-344','rematch-opening','rematch-turn-11','apprentice-corridor','apprentice-pocket','apprentice-wall-cut','apprentice-top-cut','apprentice-long-corridor','apprentice-food-race'])requests.push(JSON.parse(await readFile(new URL('../test/fixtures/'+name+'.json',import.meta.url))));
for(let i=0;i<requests.length;i++){
 const request=requests[i],nodes=request.board.snakes.length===2&&request.game.ruleset.name!=='constrictor'?baseNodes*2:baseNodes;
 const expected=chooseMove(request,{nodes}).move,before=performance.now(),row={index:i,mode:request.game.ruleset.name,turn:request.turn,status:null,move:null,expected,error:null,ms:0};
 try{const r=await fetch(url+'/move',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(timeout)});row.status=r.status;const data=await r.json();row.move=data.move??null;if(!r.ok)row.error='HTTP '+r.status;else if(row.move!==expected)row.error='Move differs from local code';}catch(e){row.error=e.name+': '+e.message;}
 row.ms=performance.now()-before;report.rows.push(row);
}
const times=report.rows.map(r=>r.ms).sort((a,b)=>a-b);report.requests=report.rows.length;report.failures=report.rows.filter(r=>r.error).length;report.meanMs=times.reduce((a,b)=>a+b)/times.length;report.p95Ms=times[times.length*.95|0];report.maxMs=times.at(-1);
await mkdir('results',{recursive:true});await writeFile('results/production-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:report.rows.filter(r=>r.error)}));if(report.metadataError||report.failures)process.exitCode=1;
