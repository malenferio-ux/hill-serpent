// Hill Serpent's own bounded simultaneous maximin engine, standard duels.
// No allocator, threads, clocks, filesystem, network or external imports.
#include <stdint.h>
#include <string.h>
#define S 625
#define B 704
#define WIN 1000000.0
#define INF 1e30
#define MAX(a,b) ((a)>(b)?(a):(b))
#define MIN(a,b) ((a)<(b)?(a):(b))
static int ab(int a){return a<0?-a:a;}
typedef struct{int len,health,alive;int16_t body[B];}Snake;
typedef struct{Snake snakes[2];uint8_t food[S];}State;
typedef struct{unsigned hash;int8_t move,replies[4];}Entry;
static int32_t input[4096], output[32];
static double resultScore;
static int W,H,N,next[S][4],nodes,budget,stopped,allowed,forcedExtensions;
// Deterministic work units bound board scans and flood expansion. A node cap
// also limits overhead not represented by these units; no wall-clock polling.
static int work,workLimit;
static double penalty[4];
static Entry table[16384];
static State root;
static int moves(const State*s,int i,const uint8_t *occ,int out[4]){
 const Snake*a=&s->snakes[i];int count=0;
 if(!a->alive){out[0]=0;return 1;}
 for(int m=0;m<4;m++){int p=next[a->body[0]][m];if(p>=0&&!occ[p]&&(a->health>1||s->food[p]))out[count++]=m;}
 if(!count){int m=0;if(a->len>1)for(int d=0;d<4;d++)if(next[a->body[1]][d]==a->body[0]){m=d;break;}out[count++]=m;}
 return count;
}
static void occupied(const State*s,uint8_t*occ){memset(occ,0,N);for(int i=0;i<2;i++)if(s->snakes[i].alive)for(int k=0;k<s->snakes[i].len-1;k++)occ[s->snakes[i].body[k]]=1;}
static void step(const State*s,State*t,int a,int b){
 memcpy(t->food,s->food,N);int mm[2]={a,b};
 for(int i=0;i<2;i++){
  const Snake*x=&s->snakes[i];Snake*y=&t->snakes[i];
  if(!x->alive){*y=*x;continue;}
  int head=next[x->body[0]][mm[i]];y->len=x->len;y->health=x->health-1;y->body[0]=head;
  for(int k=1;k<x->len;k++)y->body[k]=x->body[k-1];
  if(head>=0&&s->food[head]){y->health=100;y->body[y->len]=y->body[y->len-1];y->len++;t->food[head]=0;}
  y->alive=head>=0&&y->health>0;
 }
 int dead[2]={0,0};
 for(int i=0;i<2;i++)if(t->snakes[i].alive){Snake*x=&t->snakes[i];for(int j=0;j<2;j++)if(t->snakes[j].alive){Snake*y=&t->snakes[j];for(int k=1;k<y->len;k++)if(x->body[0]==y->body[k]){dead[i]=1;break;}if(j!=i&&x->body[0]==y->body[0]&&x->len<=y->len)dead[i]=1;}}
 for(int i=0;i<2;i++)if(dead[i])t->snakes[i].alive=0;
}
static double evaluate(const State*s,int ply){
 work+=N*2;
 const Snake*a=&s->snakes[0],*b=&s->snakes[1];
 if(!a->alive)return b->alive?-WIN+ply*10:-10000+ply;
 if(!b->alive)return WIN-ply*10;
 int16_t release[S]={0},claimed[S],queue[S],seen[S]={0};int8_t owner[S];
 int area[2]={0,0},fd[2]={999,999},room[2]={0,0},tail=0;
 for(int p=0;p<N;p++){owner[p]=-1;claimed[p]=999;}
 for(int i=0;i<2;i++)for(int k=0;k<s->snakes[i].len;k++){int p=s->snakes[i].body[k];release[p]=MAX(release[p],s->snakes[i].len-k);}
 int read=0,end=0;
 for(int i=0;i<2;i++){int p=s->snakes[i].body[0];owner[p]=i;claimed[p]=0;queue[end++]=p;}
 while(read<end){work+=4;int p=queue[read++],i=owner[p];if(i<0)continue;int d=claimed[p]+1;const Snake*x=&s->snakes[i];
  for(int m=0;m<4;m++){int q=next[p][m];if(q<0||release[q]>d||claimed[q]<d)continue;if(!s->food[q]&&x->health<=d)continue;
   if(claimed[q]==999){owner[q]=i;claimed[q]=d;queue[end++]=q;}
   else if(owner[q]!=i&&owner[q]>=0){int other=owner[q];if(x->len>s->snakes[other].len)owner[q]=i;else if(x->len==s->snakes[other].len)owner[q]=-2;}
  }
 }
 for(int p=0;p<N;p++)if(owner[p]>=0){int i=owner[p];area[i]++;if(s->food[p])fd[i]=MIN(fd[i],claimed[p]);}
 room[1]=area[1];room[0]=1;seen[a->body[0]]=1;queue[0]=a->body[0];read=0;end=1;
 while(read<end&&room[0]<a->len+2){work+=4;int p=queue[read++];for(int m=0;m<4;m++){int q=next[p][m];if(q<0||seen[q]||release[q]>2||release[q]>seen[p])continue;if(!s->food[q]&&a->health<=1)continue;seen[q]=seen[p]+1;queue[end++]=q;room[0]++;if(q==a->body[a->len-1]&&q!=a->body[0])tail=1;if(room[0]>=a->len+2)break;}}
 for(int i=0;i<2;i++)if(fd[i]==999){int h=s->snakes[i].body[0];for(int p=0;p<N;p++)if(s->food[p])fd[i]=MIN(fd[i],ab(p%W-h%W)+ab(p/W-h/W));}
 double score[2];
 for(int i=0;i<2;i++){const Snake*x=&s->snakes[i];int len=x->len;double deficit=(double)MAX(0,len+2-area[i])/(len+2),territory=MIN(area[i],MAX(len*2,N*.4));
  score[i]=1.8*territory+1.2*MIN(area[i],len*2.5)+64*len-450*deficit;
  score[i]-=.5*450*(double)MAX(0,len+2-room[i])/(len+2);
  score[i]-=.5*450*2*deficit;
  score[i]+=.16*x->health;
  if(fd[i]<999){score[i]+=48.0/(fd[i]+1);if(fd[i]>=x->health)score[i]-=600;}else if(x->health<35)score[i]-=(35-x->health)*10;
  int exits=0,p=x->body[0];for(int m=0;m<4;m++){int q=next[p][m];if(q>=0&&release[q]<=1)exits++;}
  score[i]+=8*MIN(exits,2);score[i]-=.35*(ab(2*(p%W)-(W-1))+ab(2*(p/W)-(H-1)))/2.0;
 }
 double adjustment=a->len-b->len>6?-64*(a->len-b->len-6)*.8:0;
 return score[0]-score[1]+adjustment-.5*450*(double)MAX(0,a->len+2-area[0])/(a->len+2);
}
static unsigned hash(const State*s){unsigned h=2166136261u;for(int i=0;i<2;i++){const Snake*x=&s->snakes[i];h=(h^(unsigned)x->health^(x->alive?512u:0u))*16777619u;for(int k=0;k<x->len;k++)h=(h^(unsigned)(x->body[k]+1))*16777619u;h=(h^65535u)*16777619u;}return h;}
static void order(const State*s,int i,const uint8_t*occ,int *mm,int count,int preferred){
 work+=count*(N+8);double v[4];const Snake*x=&s->snakes[i];for(int j=0;j<count;j++){int m=mm[j],p=next[x->body[0]][m];v[j]=-1e6;if(p<0)continue;v[j]=m==preferred?1e5:0;if(s->food[p])v[j]+=30;int distance=100;for(int q=0;q<N;q++)if(s->food[q])distance=MIN(distance,ab(p%W-q%W)+ab(p/W-q/W));v[j]-=distance;for(int d=0;d<4;d++){int q=next[p][d];if(q>=0&&!occ[q])v[j]+=3;}}
 for(int j=1;j<count;j++){int m=mm[j];double x=v[j];int k=j;while(k>0&&v[k-1]<x){mm[k]=mm[k-1];v[k]=v[k-1];k--;}mm[k]=m;v[k]=x;}
}
static double search(const State*s,int depth,double alpha,double beta,int ply,int preferred,int extensions,int*outMove){
 if(!s->snakes[0].alive||!s->snakes[1].alive)return evaluate(s,ply);
 uint8_t occ[S];int own[4],enemy[4];occupied(s,occ);int nc=moves(s,0,occ,own),ne=moves(s,1,occ,enemy);
 if(!depth&&extensions<forcedExtensions&&(nc==1||ne==1)){depth=1;extensions++;}
 if(!depth)return evaluate(s,ply);
 if(nodes>=budget||(workLimit>0&&work>=workLimit)){stopped=1;return 0;}
 unsigned key=hash(s);Entry prev=table[key&16383];if(prev.hash!=key){prev.move=-1;for(int i=0;i<4;i++)prev.replies[i]=-1;}
 order(s,0,occ,own,nc,preferred>=0?preferred:prev.move);order(s,1,occ,enemy,ne,-1);
 double best=-INF;int selected=own[0];Entry now={.hash=key,.move=-1,.replies={-1,-1,-1,-1}};
 State child;
 for(int i=0;i<nc;i++){int move=own[i];if(ply==0&&!(allowed&(1<<move)))continue;
  if(prev.replies[move]>=0)for(int j=0;j<ne;j++)if(enemy[j]==prev.replies[move]){int z=enemy[j];for(int k=j;k>0;k--)enemy[k]=enemy[k-1];enemy[0]=z;break;}
  double pen=ply==0?penalty[move]:0,worst=INF;
  for(int j=0;j<ne;j++){
   if(worst<=alpha)break;if(nodes>=budget||(workLimit>0&&work>=workLimit)){stopped=1;return 0;}nodes++;step(s,&child,move,enemy[j]);
   double aa=alpha,bb=MIN(beta,worst);if(pen&&aa>-WIN/2&&aa<WIN/2)aa+=pen;if(pen&&bb>-WIN/2&&bb<WIN/2)bb+=pen;
   int ignored=-1;double value=search(&child,depth-1,aa,bb,ply+1,-1,extensions,&ignored);if(stopped)return 0;
   if(pen&&value>-WIN/2&&value<WIN/2)value-=pen;if(value<worst){worst=value;now.replies[move]=enemy[j];}
  }
  if(worst>best){best=worst;selected=move;}alpha=MAX(alpha,best);if(alpha>=beta)break;
 }
 now.move=selected;table[key&16383]=now;*outMove=selected;return best;
}
__attribute__((export_name("input"))) int32_t* inputPtr(){return input;}
__attribute__((export_name("output"))) int32_t* outputPtr(){return output;}
__attribute__((export_name("score"))) double scoreValue(){return resultScore;}
static int setup(){
 W=input[0];H=input[1];N=W*H;budget=input[2];int maxDepth=input[3];allowed=input[4];forcedExtensions=input[5];
 if(W<2||H<2||N>S||budget<1||budget>40000||maxDepth<1||maxDepth>12)return -1;
 for(int p=0;p<N;p++){int x=p%W,y=p/W;next[p][0]=y+1<H?p+W:-1;next[p][1]=y>0?p-W:-1;next[p][2]=x>0?p-1:-1;next[p][3]=x+1<W?p+1:-1;root.food[p]=input[32+p]!=0;}
 for(int i=0;i<2;i++){Snake*x=&root.snakes[i];x->len=input[8+i*2];x->health=input[9+i*2];x->alive=x->health>0;if(x->len<1||x->len>N+2)return -1;for(int k=0;k<x->len;k++){int p=input[672+i*672+k];if(p<0||p>=N)return -1;x->body[k]=p;}}
 for(int m=0;m<4;m++)penalty[m]=input[16+m]/1000.0;
 return 0;
}
__attribute__((export_name("run"))) int run(){
 if(setup()<0)return -1;int maxDepth=input[3];work=0;workLimit=input[7];
 nodes=0;stopped=0;memset(table,0,sizeof(table));int best=input[6],depth=0;resultScore=0;
 for(int d=1;d<=maxDepth;d++){int candidate=best;double score=search(&root,d,-INF,INF,0,best,0,&candidate);if(stopped)break;best=candidate;resultScore=score;depth=d;if(score>WIN/2||score<-WIN/2)break;}
 output[0]=best;output[1]=nodes;output[2]=depth;output[3]=work;return best;
}
__attribute__((export_name("evaluate"))) double evaluateInput(){run();return evaluate(&root,0);}
__attribute__((export_name("transition"))) int transition(int a,int b){State nextState;step(&root,&nextState,a,b);for(int i=0;i<2;i++){Snake*x=&nextState.snakes[i];input[8+i*2]=x->len;input[9+i*2]=x->health;input[12+i]=x->alive;for(int k=0;k<x->len;k++)input[672+i*672+k]=x->body[k];}for(int p=0;p<N;p++)input[32+p]=nextState.food[p];return 0;}

static int soloNodes,soloDeep,soloExhausted,soloHorizon;
static int16_t soloRelease[S];static uint8_t soloFood[S];
static int soloVisit(const int16_t*body,int len,int turn,int move){
 if(soloNodes>=256){soloExhausted=1;return 1;}soloNodes++;
 int head=next[body[0]][move];if(head<0||soloRelease[head]>turn)return 0;
 for(int k=0;k<len-1;k++)if(body[k]==head)return 0;
 int16_t bodyNext[B];bodyNext[0]=head;for(int k=1;k<len;k++)bodyNext[k]=body[k-1];int ate=soloFood[head],newLen=len;
 if(ate){bodyNext[newLen]=bodyNext[newLen-1];newLen++;soloFood[head]=0;}
 soloDeep=MAX(soloDeep,turn);int survives=turn>=soloHorizon;
 if(!survives){if(soloVisit(bodyNext,newLen,turn+1,move))survives=1;else for(int m=0;m<4;m++)if(m!=move&&soloVisit(bodyNext,newLen,turn+1,m)){survives=1;break;}}
 if(ate)soloFood[head]=ate;return survives;
}
static int replyNodes,replyDeep,replyExhausted,replyLimit;
static int losing(const State*s,int remaining,int forced,int lastMove){
 if(!s->snakes[0].alive)return s->snakes[1].alive;if(!s->snakes[1].alive||!remaining)return 0;
 uint8_t occ[S];occupied(s,occ);int own[4],nc;if(forced>=0){own[0]=forced;nc=1;}else nc=moves(s,0,occ,own);
 for(int j=0;j<nc;j++)if(own[j]==lastMove){int m=own[j];for(int k=j;k>0;k--)own[k]=own[k-1];own[0]=m;break;}
 State child;
 for(int i=0;i<nc;i++){
  int m=own[i],target=next[s->snakes[0].body[0]][m],enemy[4],ne=moves(s,1,occ,enemy),dist[4];
  for(int j=0;j<ne;j++){int p=next[s->snakes[1].body[0]][enemy[j]];dist[j]=p<0||target<0?9990:10*(ab(p%W-target%W)+ab(p/W-target/W))-(enemy[j]==m);}
  for(int j=1;j<ne;j++){int z=enemy[j],d=dist[j],k=j;while(k>0&&dist[k-1]>d){enemy[k]=enemy[k-1];dist[k]=dist[k-1];k--;}enemy[k]=z;dist[k]=d;}
  int kill=0;for(int j=0;j<ne;j++){if(replyNodes>=replyLimit){replyExhausted=1;return 0;}replyNodes++;replyDeep=MAX(replyDeep,21-remaining);step(s,&child,m,enemy[j]);if(losing(&child,remaining-1,-1,m)){kill=1;break;}}
  if(!kill)return 0;
 }
 return 1;
}
__attribute__((export_name("guards"))) int guards(){
 if(setup()<0)return -1;memset(soloRelease,0,sizeof(soloRelease));memcpy(soloFood,root.food,N);memset(output,0,sizeof(output));
 const Snake*a=&root.snakes[0],*b=&root.snakes[1];for(int k=0;k<b->len;k++){int d=b->len-k;soloRelease[b->body[k]]=MAX(soloRelease[b->body[k]],d+(d>1));}
 uint8_t occ[S];occupied(&root,occ);int own[4],nc=moves(&root,0,occ,own);soloHorizon=MIN(64,MAX(20,a->len+8));replyLimit=MAX(64,MIN(512,input[21]));
 for(int i=0;i<nc;i++){
  int m=own[i];soloNodes=0;soloDeep=0;soloExhausted=0;int trap=!soloVisit(a->body,a->len,1,m)&&!soloExhausted;
  int p=next[a->body[0]][m],x=p%W,y=p/W,edge=MIN(MIN(x,y),MIN(W-1-x,H-1-y)),gap=ab(a->body[0]%W-b->body[0]%W)+ab(a->body[0]/W-b->body[0]/W);
  output[m*8]=trap;output[m*8+1]=soloNodes;output[m*8+2]=soloDeep;
  if(input[20]&&!trap&&(gap<=5||(edge<=2&&gap<=10))){replyNodes=0;replyDeep=0;replyExhausted=0;int joint=losing(&root,20,m,m);output[m*8+3]=replyNodes;output[m*8+4]=replyDeep;output[m*8+5]=replyExhausted;output[m*8+6]=joint;output[m*8+7]=1;}
 }
 return 0;
}
