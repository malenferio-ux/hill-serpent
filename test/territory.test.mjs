import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Evaluator} from '../src/agent.mjs';
import {fromRequest} from '../src/game.mjs';
import {fixture} from './helpers.mjs';

// Independent slow reference: collect sets of arrivals for a complete layer
// before assigning ownership, instead of updating cells in a queue.
function territoryReference(s) {
  const release=new Map(),owned=new Map(),arrival=new Map();
  s.snakes.forEach((snake,i)=>{if(!snake.alive)return;
    snake.body.forEach((p,k)=>release.set(p,Math.max(release.get(p)||0,snake.body.length-k)));
    owned.set(snake.body[0],i);arrival.set(snake.body[0],0);
  });
  let frontier=new Map(owned),depth=0;
  while(frontier.size) {
    depth++;const candidates=new Map();
    for(const[p,owner]of frontier)for(let m=0;m<4;m++) {
      const q=s.g.next[p*4+m];if(q<0||owned.has(q)||(release.get(q)||0)>depth)continue;
      const snake=s.snakes[owner];if(!s.food[q]&&snake.health<=depth+s.hazards[q]*s.hazardDamage)continue;
      if(!candidates.has(q))candidates.set(q,new Set());candidates.get(q).add(owner);
    }
    frontier=new Map();
    for(const[q,owners]of candidates) {
      const longest=Math.max(...[...owners].map(i=>s.snakes[i].body.length));
      const winners=[...owners].filter(i=>s.snakes[i].body.length===longest);
      const winner=winners.length===1?winners[0]:-2;owned.set(q,winner);arrival.set(q,depth);
      if(winner>=0)frontier.set(q,winner);
    }
  }
  const area=s.snakes.map(()=>0),food=s.snakes.map(()=>999);
  for(const[p,i]of owned)if(i>=0){area[i]+=s.hazards[p]?.2:1;if(s.food[p])food[i]=Math.min(food[i],arrival.get(p));}
  return {area,food,owned};
}

test('competitive territory resolves whole arrival layers and cannot cross a contested choke',async()=>{
  const hazards=Array.from({length:25},(_,i)=>i).filter(i=>![6,7,8,12,17,22].includes(i));
  const requests=[fixture({width:5,height:5,bodies:[[6,6,6],[8,8,8]],food:[22],hazards,hazardDamage:100}),
    fixture({width:5,height:5,bodies:[[6,6,6,6],[8,8,8]],food:[22],hazards,hazardDamage:100})];
  for(const name of ['expert-right-pocket','expert-top-strip','expert-left-wall'])requests.push(JSON.parse(await readFile(new URL('./fixtures/'+name+'.json',import.meta.url))));
  for(const r of requests){const s=fromRequest(r),e=new Evaluator(s.g,2),expected=territoryReference(s);e.analyze(s);
    assert.deepEqual([...e.areas],expected.area);
    assert.deepEqual([...e.raceFoodDistances],expected.food);
    for(let p=0;p<s.g.size;p++)assert.equal(e.owners[p],expected.owned.get(p)??-1);
  }
  const equal=new Evaluator(fromRequest(requests[0]).g,2);equal.analyze(fromRequest(requests[0]));
  assert.equal(equal.owners[7],-2);assert.equal(equal.owners[22],-1);
  const longer=new Evaluator(fromRequest(requests[1]).g,2);longer.analyze(fromRequest(requests[1]));
  assert.equal(longer.owners[7],0);assert.equal(longer.owners[22],0);
});
