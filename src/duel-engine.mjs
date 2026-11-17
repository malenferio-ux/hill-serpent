export function makeEngine(module){
 const instance=module instanceof WebAssembly.Instance?module:new WebAssembly.Instance(module,{}),e=instance.exports;
 const mem=new Int32Array(e.memory.buffer),ptr=e.input()/4,out=e.output()/4;
 function load(s,{nodeLimit=384,maxDepth=7,allowedRoot=[0,1,2,3],guardPenalty=[0,0,0,0],bestMove=0,forcedExtension=2,workBudget=0,replyGuard=true,replyNodes=192}={}){
  mem[ptr]=s.g.width;mem[ptr+1]=s.g.height;mem[ptr+2]=nodeLimit;mem[ptr+3]=maxDepth;mem[ptr+4]=allowedRoot.reduce((x,m)=>x|1<<m,0);mem[ptr+5]=forcedExtension;mem[ptr+6]=bestMove;mem[ptr+7]=workBudget;mem[ptr+20]=replyGuard?1:0;mem[ptr+21]=replyNodes;
  for(let i=0;i<2;i++){mem[ptr+8+i*2]=s.snakes[i].body.length;mem[ptr+9+i*2]=s.snakes[i].health;mem.set(s.snakes[i].body,ptr+672+i*672);}
  for(let m=0;m<4;m++)mem[ptr+16+m]=Math.round(guardPenalty[m]*1000);
  mem.set(s.food,ptr+32);
 }
 const search=(s,opts)=>{load(s,opts);const m=e.run();if(m<0)throw Error('Invalid engine input');return{move:['up','down','left','right'][m],score:e.score(),nodes:mem[out+1],depth:mem[out+2],work:mem[out+3],engine:'wasm'};};
 const guards=(s,opts={})=>{load(s,opts);if(e.guards()<0)throw Error('Invalid guard input');const r={};for(let m=0;m<4;m++){const p=out+m*8,probe={trapped:!!mem[p],nodes:mem[p+1],deepest:mem[p+2]};if(mem[p+7]){probe.soloNodes=probe.nodes;probe.replyNodes=mem[p+3];probe.replyExhausted=!!mem[p+5];probe.replyDepth=mem[p+4];probe.nodes+=probe.replyNodes;if(mem[p+6]){probe.trapped=true;probe.deepest=probe.replyDepth;probe.kind='forced-replies';}}r[['up','down','left','right'][m]]=probe;}return r;};
 return{search,guards,load,e,mem,ptr, evaluate(s){load(s,{nodeLimit:1,maxDepth:1});return e.evaluate();},transition(s,mm){load(s,{nodeLimit:1,maxDepth:1});e.run();e.transition(...mm);return{food:Array.from(mem.slice(ptr+32,ptr+32+s.g.size)),snakes:s.snakes.map((x,i)=>({len:mem[ptr+8+i*2],health:mem[ptr+9+i*2],alive:!!mem[ptr+12+i],body:Array.from(mem.slice(ptr+672+i*672,ptr+672+i*672+mem[ptr+8+i*2]))}))};}};
}
