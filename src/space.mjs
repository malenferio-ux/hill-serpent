// Upper bound on a simple route in the current free-cell graph. Every
// articulation can be used only once; separate branches cannot be added.
export function routeSpace(state,index=0){
 const {g,snakes}=state,head=snakes[index].body[0],blocked=new Uint8Array(g.size);
 for(const s of snakes)if(s.alive)for(let k=0;k<s.body.length-1;k++)blocked[s.body[k]]=1;
 blocked[head]=0;
 const disc=new Int16Array(g.size),low=new Int16Array(g.size),edges=[],blocks=[],membership=Array.from({length:g.size},()=>[]);let time=0;
 function visit(p,parent){disc[p]=low[p]=++time;
  for(let m=0;m<4;m++){const q=g.next[p*4+m];if(q<0||blocked[q]||q===parent)continue;
   if(!disc[q]){edges.push([p,q]);visit(q,p);low[p]=Math.min(low[p],low[q]);
    if(low[q]>=disc[p]){const cells=new Set();let edge;do{edge=edges.pop();cells.add(edge[0]);cells.add(edge[1]);}while(edge[0]!==p||edge[1]!==q);const id=blocks.length;blocks.push([...cells]);for(const c of cells)membership[c].push(id);}
   }else if(disc[q]<disc[p]){low[p]=Math.min(low[p],disc[q]);edges.push([p,q]);}
  }
 }
 visit(head,-1);
 function beyond(p,parentBlock){let best=0;for(const id of membership[p])if(id!==parentBlock){let branch=0;for(const q of blocks[id])if(q!==p)branch=Math.max(branch,beyond(q,id));best=Math.max(best,blocks[id].length-1+branch);}return best;}
 return{room:time,route:1+beyond(head,-1)};
}
