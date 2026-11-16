import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {CATALOG,CLASSIC,complete,conflicts,parseCatalog,violations} from './sudoku.ts';
import type {Rules} from './sudoku.ts';
import {activeCells,geometryUnits,isActive,moveCell,parseExtra,sizeOf} from './sudoku-extra.ts';
import {blankBoard,boardOf,choose,newGame,place,redo,reset,restore,select,serialize,toggleNote,undo} from './sudoku-game.ts';
import {SAMURAI_SOLUTION} from './__tests__/fixtures.ts';
const rules=(extra:Partial<Rules>):Rules=>({...CLASSIC,...extra});
const blank=()=>Array(81).fill(0);
describe('remaining variants',()=>{
 it('arrow sums, including repeated shaft digits where classic permits',()=>{
  const p=rules({variant:'arrow',arrows:[{circle:0,cells:[1,11,21]}]});
  const c=blank();c[0]=5;c[1]=2;c[11]=1;c[21]=2;
  expect(violations(c,p)).toEqual([]);
  c[0]=6;expect(violations(c,p).some(v=>v.rule==='arrow')).toBe(true);
  c[0]=0;c[1]=9;expect(violations(c,p).some(v=>v.rule==='arrow')).toBe(true);
 });
 it('renban is an unordered distinct consecutive set, not a thermo',()=>{
  const p=rules({variant:'renban',renbans:[[0,10,20]]});const c=blank();
  [3,1,2].forEach((n,k)=>c[k*10]=n);expect(violations(c,p)).toEqual([]);
  c[0]=4;expect(violations(c,p).some(v=>v.rule==='renban')).toBe(true);
  c[0]=1;expect(violations(c,p).some(v=>v.rule==='renban')).toBe(true);
 });
 it('Kropki white is difference 1, black is ratio 2, absence is unrestricted',()=>{
  const c=blank();c[0]=1;c[1]=2;c[2]=3;
  for(const kind of ['white','black'] as const)expect(violations(c,rules({variant:'kropki',dots:[{cells:[0,1],kind}]}))).toEqual([]);
  c[0]=2;c[1]=4;c[2]=0;
  expect(violations(c,rules({variant:'kropki',dots:[{cells:[0,1],kind:'black'}]}))).toEqual([]);
  expect(violations(c,rules({variant:'kropki',dots:[{cells:[0,1],kind:'white'}]}))).toHaveLength(1);
  c[0]=3;expect(violations(c,rules({variant:'kropki',dots:[{cells:[0,1],kind:'black'}]}))).toHaveLength(1);
 });
 it('Little Killer allows repetitions, but insists on the exact diagonal sum',()=>{
  const p=rules({variant:'littlekiller',littleKillers:[{sum:18,cells:Array.from({length:9},(_,k)=>k*10)}]});
  const c=blank();for(let k=0;k<9;k++)c[k*10]=k%3+1;
  expect(violations(c,p)).toEqual([]);
  p.littleKillers![0].sum=19;expect(violations(c,p).some(v=>v.rule==='littlekiller')).toBe(true);
  c[80]=0;expect(violations(c,p)).toEqual([]);
 });
 it('jigsaw regions replace boxes, and every region remains all-different',()=>{
  // The boxes, except that R1C3 now belongs to the second region and R2C4 to the first (both stay connected).
  const box=(k:number)=>Array.from({length:9},(_,j)=>(Math.floor(k/3)*3+Math.floor(j/3))*9+k%3*3+j%3);
  const regions=Array.from({length:9},(_,k)=>box(k));
  regions[0]=regions[0].filter(i=>i!==2).concat(12);regions[1]=regions[1].filter(i=>i!==12).concat(2);
  const p=rules({variant:'jigsaw',regions});
  expect(typeof parseExtra({variant:'jigsaw',regions})).toBe('object');
  const region=(i:number)=>regions.findIndex(r=>r.includes(i));
  expect(region(2)).toBe(1);expect(region(10)).toBe(0);
  const c=blank();c[2]=c[10]=4;                       // same classic box, different rows, columns and regions
  expect(conflicts(c,CLASSIC).size).toBe(2);expect(conflicts(c,p).size).toBe(0);
  c[10]=0;c[3]=4;                                     // R1C3 and R1C4 share a row anyway
  expect(conflicts(c,p).size).toBe(2);
  const e=blank();e[2]=e[22]=5;                       // R1C3 and R3C4 are both in region 1; different row and column
  expect(violations(e,p).some(v=>v.rule==='region')).toBe(true);
  expect(violations(e,CLASSIC).some(v=>v.rule==='box')).toBe(false);
 });
});
describe('Samurai geometry and persistence',()=>{
 // A fixture from this repo's own code: a valid Samurai fill with every fourth active cell left blank.
 const entry={id:'samurai-fixture',name:'Fixture',variant:'samurai',difficulty:'easy',rating:'Provisional test rating.',
  solution:SAMURAI_SOLUTION,givens:SAMURAI_SOLUTION.split('').map((ch,k)=>k%4===0&&ch!=='0'?'0':ch).join('')};
 const parsed=parseCatalog({version:1,puzzles:[entry]});
 const p=parsed.puzzles[0];
 beforeAll(()=>{CATALOG.push(p);});
 afterAll(()=>{CATALOG.splice(CATALOG.indexOf(p),1);});
 it('the fixture is accepted by the catalog parser',()=>{expect(parsed.errors).toEqual([]);expect(p.variant).toBe('samurai');});
 it('has 369 active cells, 72 holes and 135 units over a 21x21 footprint',()=>{
  expect(sizeOf(p)).toBe(441);expect(activeCells(p)).toHaveLength(369);expect(new Set(activeCells(p)).size).toBe(369);
  expect(geometryUnits(p)).toHaveLength(135);
  const overlap=6*21+6;
  expect(geometryUnits(p).filter(u=>u.rule==='row'&&u.cells.includes(overlap))).toHaveLength(2);
  expect(complete(p.solution,p)).toBe(true);
  const c=[...p.solution];c[9]=1;expect(complete(c,p)).toBe(false);
  c[9]=0;c[overlap]=0;expect(complete(c,p)).toBe(false);
 });
 it('navigation skips holes but never leaves the footprint or selects a hole',()=>{
  expect(isActive(p,9)).toBe(false);expect(moveCell(p,8,0,1)).toBe(12);expect(moveCell(p,12,0,-1)).toBe(8);
  expect(moveCell(p,0,-1,0)).toBe(0);
  for(const i of activeCells(p))for(const [r,c]of [[-1,0],[1,0],[0,-1],[0,1]])expect(isActive(p,moveCell(p,i,r,c))).toBe(true);
 });
 it('preserves notes, colors, edits and undo across layout switches and v2 reload',()=>{
  const g=newGame(p),overlap=6*21+6;
  expect(select(g,9)).toBe(false);
  const i=p.givens.findIndex((n,i)=>!n&&isActive(p,i));select(g,i);
  expect(toggleNote(g,'corner',3)).toBe(true);
  const saved=serialize(g);expect(restore(saved)).not.toBeNull();
  expect(boardOf(restore(saved)!).corner[i]).toBe(4);
  expect(place(g,p.solution[i])).toBe(true);expect(undo(g)).toBe(true);expect(boardOf(g).corner[i]).toBe(4);
  expect(redo(g)).toBe(true);expect(reset(g)).toBe(true);expect(undo(g)).toBe(true);
  choose(g,CATALOG[0].id);expect(boardOf(g).cells).toHaveLength(81);
  choose(g,p.id);expect(boardOf(g).cells).toHaveLength(441);expect(boardOf(g).cells[i]).toBe(p.solution[i]);
  // The overlapping coordinate is stored once, not one value per component.
  expect(blankBoard(p).cells[overlap]).toBe(p.givens[overlap]);
 });
 it('rejects all hole data and invalid selected positions on restore',()=>{
  for(const field of ['cells','corner','center','colors']){
   const g=newGame(p);(boardOf(g) as any)[field][9]=1;
   expect(boardOf(restore(serialize(g))!)[field as 'cells'][9]).toBe(0);
  }
  const g=newGame(p);boardOf(g).selected=9;expect(boardOf(restore(serialize(g))!).selected).toBe(0);
 });
});
describe('clue validation',()=>{
 const bad:[string,Record<string,unknown>,RegExp][]=[
  ['arrows not a list',{variant:'arrow',arrows:null},/bad arrows/],
  ['no arrows for an arrow puzzle',{variant:'arrow',arrows:[]},/missing arrows/],
  ['a shaft not touching its circle',{variant:'arrow',arrows:[{circle:0,cells:[40,41]}]},/bad arrow/],
  ['a one-cell shaft',{variant:'arrow',arrows:[{circle:0,cells:[1]}]},/bad arrow/],
  ['a renban that jumps',{variant:'renban',renbans:[[0,80]]},/bad renban/],
  ['a renban that repeats a cell',{variant:'renban',renbans:[[0,1,0]]},/bad renban/],
  ['a dot between cells that do not touch',{variant:'kropki',dots:[{cells:[8,9],kind:'white'}]},/Kropki/],
  ['an unknown dot colour',{variant:'kropki',dots:[{cells:[0,1],kind:'red'}]},/Kropki/],
  ['two dots on one pair',{variant:'kropki',dots:[{cells:[0,1],kind:'black'},{cells:[1,0],kind:'white'}]},/duplicate/],
  ['a bent little killer',{variant:'littlekiller',littleKillers:[{sum:9,cells:[0,10,21]}]},/straight|Little Killer/],
  ['a little killer not edge to edge',{variant:'littlekiller',littleKillers:[{sum:5,cells:[10,20]}]},/edge to edge/],
  ['an impossible little killer sum',{variant:'littlekiller',littleKillers:[{sum:900,cells:[0,10,20]}]},/Little Killer/],
  ['no regions for a jigsaw',{variant:'jigsaw',regions:[]},/regions/],
  ['one region only',{variant:'jigsaw',regions:[Array.from({length:9},(_,k)=>k*10)]},/region|cover/],
  ['a foreign clue on a kropki puzzle',{variant:'kropki',dots:[{cells:[0,1],kind:'white'}],renbans:[[0,1,2]]},/unexpected/],
 ];
 for(const [name,x,message] of bad)it(`rejects ${name}`,()=>{const r=parseExtra(x);expect(typeof r).toBe('string');expect(r as string).toMatch(message);});
 it('accepts well-formed clues',()=>{
  expect(typeof parseExtra({variant:'arrow',arrows:[{circle:2,cells:[1,0]}]})).toBe('object');
  expect(typeof parseExtra({variant:'renban',renbans:[[0,1,2]]})).toBe('object');
  expect(typeof parseExtra({variant:'kropki',dots:[{cells:[0,1],kind:'white'}]})).toBe('object');
  expect(typeof parseExtra({variant:'littlekiller',littleKillers:[{sum:45,cells:Array.from({length:9},(_,k)=>k*10)}]})).toBe('object');
 });
 it('rejects a Samurai entry with a broken fill, no shape, or standard-grid-only clues',()=>{
  const base={id:'s',name:'S',variant:'samurai',difficulty:'easy',rating:'Provisional.',solution:SAMURAI_SOLUTION,givens:SAMURAI_SOLUTION};
  expect(parseCatalog({version:1,puzzles:[base]}).errors).toEqual([]);
  const entries=[
   {...base,givens:'0'.repeat(81)},
   {...base,solution:SAMURAI_SOLUTION.slice(0,9)+'1'+SAMURAI_SOLUTION.slice(10)},
   {...base,arrows:[{circle:0,cells:[1,2]}]},
   {...base,thermometers:[[8,9]]},
   {...base,cages:[{sum:1,cells:[9]}]},
   {...base,rowSandwich:[0,...Array(8).fill(null)]},
  ];
  for(const e of entries)expect(parseCatalog({version:1,puzzles:[e]}).errors,JSON.stringify(e).slice(0,120)).not.toHaveLength(0);
 });
});
