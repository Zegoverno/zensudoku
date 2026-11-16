// Test/offline-fixture reference solver. Does not import production rules or geometry.
// Most-constrained-first search; a budget exhaustion conservatively reports >=2, never uniqueness.
import type { Rules } from '../sudoku.ts';
export function reference(p:Rules,givens:number[],limit=2,budget=Infinity):{count:number;nodes:number;answer:number[]|null} {
 const sam=p.variant==='samurai',w=sam?21:9,size=w*w;
 const origins=sam?[[0,0],[0,12],[6,6],[12,0],[12,12]]:[[0,0]];
 const active=Array.from({length:size},(_,i)=>i).filter(i=>origins.some(([r,c])=>Math.floor(i/w)>=r&&Math.floor(i/w)<r+9&&i%w>=c&&i%w<c+9));
 const units:number[][]=[];
 for(const [r,c]of origins)for(let k=0;k<9;k++){
  units.push(Array.from({length:9},(_,j)=>(r+k)*w+c+j),Array.from({length:9},(_,j)=>(r+j)*w+c+k));
  if(p.variant!=='jigsaw')units.push(Array.from({length:9},(_,j)=>(r+Math.floor(k/3)*3+Math.floor(j/3))*w+c+k%3*3+j%3));
 }
 if(p.variant==='diagonal')units.push(Array.from({length:9},(_,j)=>j*10),Array.from({length:9},(_,j)=>8+j*8));
 if(p.variant==='jigsaw')units.push(...(p.regions??[]));
 units.push(...p.cages.map(c=>c.cells));
 const peers=Array.from({length:size},(_,i)=>new Set(units.filter(u=>u.includes(i)).flat().filter(j=>j!==i)));
 const cells=[...givens];let nodes=0,answer:number[]|null=null;
 if(cells.length!==size||cells.some((n,i)=>!active.includes(i)&&n!==0))return{count:0,nodes,answer};
 const neighbours=Array.from({length:size},(_,i)=>active.filter(j=>Math.abs(Math.floor(i/w)-Math.floor(j/w))+Math.abs(i%w-j%w)===1));
 const pair=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(',');
 const marks=new Set(p.consecutive.map(([a,b])=>pair(a,b)));
 const ok=(i:number,n:number):boolean=>{
  if([...peers[i]].some(j=>cells[j]===n))return false;
  for(const c of p.cages)if(c.cells.includes(i)){
   const nums=c.cells.map(j=>j===i?n:cells[j]);const missing=nums.filter(n=>!n).length,have=nums.reduce((s,n)=>s+n,0);
   if(have+missing>c.sum||have+9*missing<c.sum)return false;
  }
  for(const t of p.thermometers){
   const k=t.indexOf(i);if(k<0)continue;
   if(n<k+1||n>9-(t.length-k-1))return false;
   for(let j=0;j<t.length;j++)if(j!==k&&cells[t[j]]&&(j<k?n-cells[t[j]]<k-j:cells[t[j]]-n<j-k))return false;
  }
  if(p.variant==='consecutive'||p.variant==='nonconsecutive')for(const j of neighbours[i])if(cells[j]&&((Math.abs(cells[j]-n)===1)!==marks.has(pair(i,j))))return false;
  for(const d of p.dots??[])if(d.cells.includes(i)){
   const other=cells[d.cells.find(j=>j!==i)!];if(!other)continue;
   if(d.kind==='white'?Math.abs(n-other)!==1:Math.max(n,other)!==Math.min(n,other)*2)return false;
  }
  for(const line of p.renbans??[])if(line.includes(i)){
   const filled=line.filter(j=>j!==i&&cells[j]).map(j=>cells[j]).concat(n);
   if(new Set(filled).size!==filled.length||Math.max(...filled)-Math.min(...filled)>=line.length)return false;
  }
  cells[i]=n;let fine=true;
  for(const a of p.arrows??[]){
   const nums=a.cells.map(j=>cells[j]),have=nums.reduce((s,n)=>s+n,0),missing=nums.filter(n=>!n).length,target=cells[a.circle]||9;
   if(have+missing>target||(cells[a.circle]&&have+missing*9<target))fine=false;
  }
  for(const d of p.littleKillers??[]){
   const nums=d.cells.map(j=>cells[j]),have=nums.reduce((s,n)=>s+n,0),missing=nums.filter(n=>!n).length;
   if(have+missing>d.sum||have+missing*9<d.sum)fine=false;
  }
  for(let k=0;k<9;k++)for(const [clues,line]of [
   [p.rowSandwich,Array.from({length:9},(_,j)=>k*9+j)],
   [p.colSandwich,Array.from({length:9},(_,j)=>j*9+k)]
  ]as const){
   const want=clues[k];if(want==null)continue;
   const a=line.findIndex(j=>cells[j]===1),b=line.findIndex(j=>cells[j]===9);if(a<0||b<0)continue;
   const nums=line.slice(Math.min(a,b)+1,Math.max(a,b)).map(j=>cells[j]),have=nums.reduce((s,n)=>s+n,0),missing=nums.filter(n=>!n).length;
   if(have+missing>want||have+missing*8<want)fine=false;
  }
  cells[i]=0;return fine;
 };
 for(const i of active)if(cells[i]){const n=cells[i];cells[i]=0;const fine=n>=1&&n<=9&&ok(i,n);cells[i]=n;if(!fine)return{count:0,nodes,answer};}
 const search=():number=>{
  if(++nodes>budget)return limit;
  let best=-1,options:number[]=[];
  for(const i of active)if(!cells[i]){
   const ns=[1,2,3,4,5,6,7,8,9].filter(n=>ok(i,n));if(!ns.length)return 0;
   if(best<0||ns.length<options.length){best=i;options=ns;if(ns.length===1)break;}
  }
  if(best<0){answer=[...cells];return 1;}
  let found=0;for(const n of options){cells[best]=n;found+=search();if(found>=limit)break;}cells[best]=0;return found;
 };
 return{count:search(),nodes,answer};
}
