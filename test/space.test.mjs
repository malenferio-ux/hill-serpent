import test from 'node:test';
import assert from 'node:assert/strict';import{routeSpace}from'../src/space.mjs';import{geometry}from'../src/game.mjs';
test('Static route capacity bounds all simple paths on every 3x3 graph',()=>{
let cases=0;
for(let mask=1;mask<512;mask++)for(let head=0;head<9;head++)if(mask>>head&1){
 const g=geometry(3,3),blocked=[];for(let p=0;p<9;p++)if(!(mask>>p&1))blocked.push(p);
 const snakes=[{body:[head,head,head],alive:true,health:100}];if(blocked.length)snakes.push({body:[...blocked,blocked.at(-1)],alive:true,health:100});
 const measured=routeSpace({g,snakes}),seen=new Set([head]),queue=[head];
 for(let i=0;i<queue.length;i++)for(let m=0;m<4;m++){const q=g.next[queue[i]*4+m];if(q>=0&&(mask>>q&1)&&!seen.has(q)){seen.add(q);queue.push(q);}}
 let longest=1;function walk(p,used,count){longest=Math.max(longest,count);for(let m=0;m<4;m++){const q=g.next[p*4+m];if(q>=0&&(mask>>q&1)&&!(used>>q&1))walk(q,used|1<<q,count+1);}}
 walk(head,1<<head,1);assert.equal(measured.room,seen.size);assert.ok(measured.route>=longest,JSON.stringify({mask,head,measured,longest}));assert.ok(measured.route<=measured.room);cases++;
}
assert.equal(cases,2304);
});

import {readFile} from 'node:fs/promises';
import {chooseMove} from '../src/agent.mjs';
import {duelEngine} from '../src/duel-node.mjs';
test('Real Expert fork keeps the longer available route open', async()=>{
 const request=JSON.parse(await readFile(new URL('./fixtures/expert-branch.json',import.meta.url)));
 const opt={nodes:40000,depth:12,workBudget:1000000,searchEngine:duelEngine.search,survivalEngine:duelEngine.guards};
 assert.equal(chooseMove(request,{...opt,branchPenalty:0}).move,'left');
 assert.equal(chooseMove(request,opt).move,'up');
});
