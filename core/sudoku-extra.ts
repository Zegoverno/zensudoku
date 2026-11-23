// Geometry and the second family of Sudoku constraints. Standard ids remain 0..80; Samurai
// uses row-major 21x21 ids with 72 inactive holes. Overlap cells have one id and one saved value.
// Jigsaw replaces boxes; Samurai has five independent row/column/box systems, sharing overlaps.
// A SudokuPad puzzle (`pad`) brings its own rows × cols array, played area and units.
import type { PadModel } from './sudokupad.ts';
export const ORIGINS = [[0,0], [0,12], [6,6], [12,0], [12,12]] as const;
export interface Arrow { circle: number; cells: number[] }
export interface Dot { cells: [number, number]; kind: 'white' | 'black' }
export interface DiagonalSum { sum: number; cells: number[] }
export interface ExtraRules {
  variant: string;
  arrows?: Arrow[];
  renbans?: number[][];
  dots?: Dot[];
  littleKillers?: DiagonalSum[];
  regions?: number[][];
  pad?: PadModel;
}
const STANDARD = Array.from({ length: 81 }, (_, i) => i);
const SAMURAI = Array.from({ length: 441 }, (_, i) => i).filter(i => ORIGINS.some(([r,c]) => i / 21 >= r && Math.floor(i / 21) < r + 9 && i % 21 >= c && i % 21 < c + 9));
const padActive = new WeakMap<PadModel, Set<number>>();
const activeSetOf = (pad: PadModel) => { let s = padActive.get(pad); if (!s) padActive.set(pad, s = new Set(pad.active)); return s; };
export const widthOf = (p: ExtraRules) => p.pad ? p.pad.cols : p.variant === 'samurai' ? 21 : 9;
export const heightOf = (p: ExtraRules) => p.pad ? p.pad.rows : widthOf(p);
export const sizeOf = (p: ExtraRules) => widthOf(p) * heightOf(p);
/** The digits played: 1..digitsOf. */
export const digitsOf = (p: ExtraRules) => p.pad ? p.pad.digits : 9;
export const activeCells = (p: ExtraRules): number[] => p.pad ? p.pad.active : p.variant === 'samurai' ? SAMURAI : STANDARD;
export const isActive = (p: ExtraRules, i: number) => Number.isInteger(i) && i >= 0 && i < sizeOf(p) && (p.pad ? activeSetOf(p.pad).has(i) : p.variant !== 'samurai' || SAMURAI.includes(i));
/** R1C1 is the played area's top-left cell (a SudokuPad grid may have clue rows around it). */
export const coord = (p: ExtraRules, i: number) => {
  const [r0, c0] = p.pad?.origin ?? [0, 0];
  return `R${Math.floor(i / widthOf(p)) - r0 + 1}C${i % widthOf(p) - c0 + 1}`;
};
export type UnitKind = 'row' | 'column' | 'box' | 'region' | 'diagonal';
export interface Unit { rule: UnitKind; label: string; cells: number[] }
export function geometryUnits(p: ExtraRules): Unit[] {
  if (p.pad) return p.pad.units;
  const out: Unit[] = [], width = widthOf(p);
  for (const [g, [r0,c0]] of (p.variant === 'samurai' ? ORIGINS : [[0,0]] as const).entries()) {
    const label = p.variant === 'samurai' ? `grid ${g + 1} ` : '';
    for (let k = 0; k < 9; k++) {
      out.push({ rule:'row', label:`${label}row ${k + 1}`, cells: STANDARD.slice(0,9).map(c => (r0+k)*width+c0+c) });
      out.push({ rule:'column', label:`${label}column ${k + 1}`, cells: STANDARD.slice(0,9).map(r => (r0+r)*width+c0+k) });
      if (p.variant !== 'jigsaw') out.push({ rule:'box', label:`${label}box ${k + 1}`, cells: STANDARD.slice(0,9).map(j => (r0+Math.floor(k/3)*3+Math.floor(j/3))*width+c0+k%3*3+j%3) });
    }
  }
  if (p.variant === 'jigsaw') for (const [k,cells] of (p.regions ?? []).entries()) out.push({rule:'region',label:`region ${k+1}`,cells});
  if (p.variant === 'diagonal') out.push({rule:'diagonal',label:'the main diagonal',cells:STANDARD.slice(0,9).map(i=>i*10)}, {rule:'diagonal',label:'the anti-diagonal',cells:STANDARD.slice(0,9).map(i=>8+i*8)});
  return out;
}
export function moveCell(p: ExtraRules, i: number, dr: number, dc: number): number {
  if (p.pad) {
    // Within the played area, wrapping at its edges.
    const { cols, origin: [r0, c0] } = p.pad, rs = activeCells(p).map(j => Math.floor(j / cols)), cs = activeCells(p).map(j => j % cols);
    const h = Math.max(...rs) - r0 + 1, w = Math.max(...cs) - c0 + 1, mod = (n: number, m: number) => ((n % m) + m) % m;
    const next = (r0 + mod(Math.floor(i / cols) - r0 + dr, h)) * cols + c0 + mod(i % cols - c0 + dc, w);
    return isActive(p, next) ? next : i;
  }
  if (p.variant !== 'samurai') return (i + dr * 9 + dc + 81) % 81;
  const w=widthOf(p); let r=Math.floor(i/w)+dr, c=i%w+dc;
  while(r>=0 && r<w && c>=0 && c<w) {
    const next=r*w+c; if(isActive(p,next))return next;
    r+=dr;c+=dc;
  }
  return i;
}
export interface ExtraViolation { rule:'arrow'|'renban'|'kropki'|'littlekiller'|'shape'; cells:number[]; message:string }
export function extraViolations(cells:number[],p:ExtraRules):ExtraViolation[] {
  const out:ExtraViolation[]=[];
  const sum=(at:number[])=>at.reduce((s,i)=>s+(cells[i]??0),0);
  const open=(at:number[])=>at.filter(i=>!cells[i]).length;
  const broken=(rule:ExtraViolation['rule'],at:number[],message:string)=>out.push({rule,cells:at,message});
  if(p.variant==='samurai') {
    const bad=cells.flatMap((n,i)=>n&&!isActive(p,i)?[i]:[]);
    if(bad.length)broken('shape',bad,'Spaces between the Samurai grids must stay empty.');
  }
  for(const a of p.arrows??[]) {
    const have=sum(a.cells),missing=open(a.cells),target=cells[a.circle]||9;
    if(have+missing>target || (cells[a.circle] && have+9*missing<target))
      broken('arrow',[a.circle,...a.cells],`Arrow at ${coord(p,a.circle)} must sum to its circle.`);
  }
  for(const line of p.renbans??[]) {
    const ns=line.map(i=>cells[i]).filter(Boolean);
    if(new Set(ns).size!==ns.length || (ns.length>0 && Math.max(...ns)-Math.min(...ns)>=line.length))
      broken('renban',line,`Renban at ${coord(p,line[0])} needs distinct consecutive digits, in any order.`);
  }
  for(const d of p.dots??[]) {
    const [a,b]=d.cells.map(i=>cells[i]);if(!a||!b)continue;
    if(d.kind==='white'?Math.abs(a-b)!==1:Math.max(a,b)!==2*Math.min(a,b))
      broken('kropki',d.cells,`${d.kind==='white'?'White':'Black'} dot at ${coord(p,d.cells[0])}: ${d.kind==='white'?'difference 1':'ratio 2'}.`);
  }
  for(const d of p.littleKillers??[]) {
    const have=sum(d.cells),missing=open(d.cells);
    if(have+missing>d.sum || have+9*missing<d.sum)
      broken('littlekiller',d.cells,`Diagonal from ${coord(p,d.cells[0])} must sum to ${d.sum}; repeats are allowed.`);
  }
  return out;
}
export function extraClues(p:ExtraRules):{title:string;items:string[]}[] {
  const out:{title:string;items:string[]}[]=[];
  const coords=(at:number[],sep=', ')=>at.map(i=>coord(p,i)).join(sep);
  if(p.arrows?.length)out.push({title:'Arrows (circle equals shaft sum)',items:p.arrows.map(a=>`${coord(p,a.circle)} = ${coords(a.cells,' + ')}`)});
  if(p.renbans?.length)out.push({title:'Renban lines (distinct consecutive digits, any order)',items:p.renbans.map(at=>coords(at,' → '))});
  if(p.dots?.length)out.push({title:'Kropki dots (unmarked pairs unrestricted)',items:p.dots.map(d=>`${d.kind}: ${coords(d.cells,' – ')}`)});
  if(p.littleKillers?.length)out.push({title:'Little Killer diagonals (repeats allowed)',items:p.littleKillers.map(d=>`Sum ${d.sum}: ${coords(d.cells,' → ')}`)});
  if(p.variant==='jigsaw')out.push({title:'Irregular regions (replace 3×3 boxes)',items:(p.regions??[]).map((at,k)=>`Region ${k+1}: ${coords(at)}`)});
  if(p.variant==='samurai')out.push({title:'Samurai: five grids, one value per overlapping cell',items:ORIGINS.map(([r,c],k)=>`Grid ${k+1}: R${r+1}C${c+1} to R${r+9}C${c+9}; 1–9 in each row, column and box.`)});
  return out;
}
const adjacent=(a:number,b:number,diagonal=false)=> {
  const dr=Math.abs(Math.floor(a/9)-Math.floor(b/9)),dc=Math.abs(a%9-b%9);
  return diagonal?Math.max(dr,dc)===1:dr+dc===1;
};
/** Strictly validate new clue shapes before the catalog is played. No imported/executable rules. */
export function parseExtra(x:any):ExtraRules|string {
  const p:ExtraRules={variant:x.variant,arrows:[],renbans:[],dots:[],littleKillers:[],regions:[]};
  const list=(key:string):any[]|null=>x[key]===undefined?[]:Array.isArray(x[key])?x[key]:null;
  const path=(at:unknown,min=2,max=9):at is number[]=>Array.isArray(at)&&at.length>=min&&at.length<=max&&new Set(at).size===at.length&&at.every(i=>Number.isInteger(i)&&i>=0&&i<81)&&at.every((i,k)=>!k||adjacent(at[k-1],i,true));
  for(const key of ['arrows','renbans','dots','littleKillers','regions'])if(!list(key))return `bad ${key}`;
  for(const a of list('arrows')!) {
    if(!a||!Number.isInteger(a.circle)||a.circle<0||a.circle>80||!path(a.cells,2,8)||a.cells.includes(a.circle)||!adjacent(a.circle,a.cells[0],true))return 'bad arrow';
    p.arrows!.push({circle:a.circle,cells:[...a.cells]});
  }
  for(const at of list('renbans')!) {if(!path(at))return 'bad renban';p.renbans!.push([...at]);}
  const seen=new Set<string>();
  for(const d of list('dots')!) {
    if(!d||!['white','black'].includes(d.kind)||!path(d.cells,2,2)||!adjacent(...d.cells as [number,number]))return 'bad Kropki dot';
    const key=[...d.cells].sort((a,b)=>a-b).join(',');if(seen.has(key))return 'duplicate Kropki pair';seen.add(key);
    p.dots!.push({cells:[d.cells[0],d.cells[1]],kind:d.kind});
  }
  for(const d of list('littleKillers')!) {
    if(!d||!path(d.cells)||!Number.isInteger(d.sum)||d.sum<d.cells.length||d.sum>d.cells.length*9)return 'bad Little Killer sum';
    const r=Math.floor(d.cells[0]/9),c=d.cells[0]%9,dr=Math.floor(d.cells[1]/9)-r,dc=d.cells[1]%9-c;
    if(Math.abs(dr)!==1||Math.abs(dc)!==1||d.cells.some((i:number,k:number)=>i!==(r+k*dr)*9+c+k*dc))return 'Little Killer must be a straight diagonal';
    const last=d.cells[d.cells.length-1],endR=Math.floor(last/9)+dr,endC=last%9+dc;
    if((r-dr>=0&&r-dr<9&&c-dc>=0&&c-dc<9)||(endR>=0&&endR<9&&endC>=0&&endC<9))return 'Little Killer must span edge to edge';
    p.littleKillers!.push({sum:d.sum,cells:[...d.cells]});
  }
  for(const at of list('regions')!) {
    if(!Array.isArray(at)||at.length!==9||new Set(at).size!==9||at.some(i=>!Number.isInteger(i)||i<0||i>80))return 'bad irregular region';
    const connected=new Set<number>([at[0]]);
    for(let pass=0;pass<9;pass++)for(const i of at)if([...connected].some(j=>adjacent(i,j)))connected.add(i);
    if(connected.size!==9)return 'disconnected irregular region';p.regions!.push([...at]);
  }
  if(p.variant==='jigsaw'&&(p.regions!.length!==9||new Set(p.regions!.flat()).size!==81))return 'irregular regions must cover each cell exactly once';
  const required:Record<string,string>={arrow:'arrows',renban:'renbans',kropki:'dots',littlekiller:'littleKillers',jigsaw:'regions'};
  for(const [variant,key] of Object.entries(required)) {
    const a=(p as any)[key] as unknown[];
    if(variant===p.variant?!a.length:a.length)return `unexpected/missing ${key} for ${p.variant}`;
  }
  return p;
}
