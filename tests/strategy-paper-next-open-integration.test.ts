import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {EXIT_MODES,EXPERIMENT_KEYS,tickStrategyPaper,openStrategyPosition,strategyExitAtClose} from '../src/strategy-paper.js';

const minute=60_000;
const time=Math.floor(Date.now()/minute)*minute-minute;
const candle=(t:number)=>({start_at:new Date(t),open:100,high:103,low:97,close:100});
const bars=Array.from({length:18},(_,i)=>candle(time-(17-i)*minute));

test('all three paper strategies fill a pending signal at next minute open, then stop on entry candle',async()=>{
 const accounts=new Map<string,{balance:number;position:any;last_bar:Date}>();
 for(const key of EXPERIMENT_KEYS)for(const v of EXIT_MODES){
  accounts.set(key+':'+v.id,{balance:100,position:v.id==='4h'?{pendingAt:time,side:key==='dip_reversal'?'LONG':'SHORT'}:null,last_bar:new Date(time-minute)});
 }
 const fills:{key:string;variant:string;entryAt:number;exitAt:number;entry:number;net:number;reason:string;model:string}[]=[];
 const client={
  async query(sql:string,params:unknown[]=[]){
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
   if(sql.includes('FROM market_candles'))return {rows:[...bars].reverse()};
   if(sql.startsWith('SELECT balance,position,last_bar FROM v6_paper_accounts')){
    const a=accounts.get(String(params[0])+':'+String(params[1]));assert.ok(a);return {rows:[a]};
   }
   if(sql.startsWith('INSERT INTO v6_paper_trades')){
    fills.push({key:String(params[0]),variant:String(params[1]),entryAt:Number(params[3]),exitAt:Number(params[4]),entry:Number(params[5]),net:Number(params[7]),reason:String(params[8]),model:String(params[9])});
    return {rows:[]};
   }
   if(sql.startsWith('UPDATE v6_paper_accounts SET balance=$3')){
    const key=String(params[0])+':'+String(params[1]),a=accounts.get(key);assert.ok(a);
    accounts.set(key,{balance:Number(params[2]),position:params[3]===null?null:JSON.parse(String(params[3])),last_bar:new Date(Number(params[4]))});
    return {rows:[]};
   }
   throw Error('Unexpected SQL: '+sql);
  },release(){}
 };
 await tickStrategyPaper({connect:async()=>client} as unknown as pg.Pool);
 assert.equal(fills.length,3);
 for(const fill of fills){
  assert.equal(fill.variant,'4h');
  assert.equal(fill.entryAt,time);
  assert.equal(fill.exitAt,time+minute,'exit is recorded at confirmed candle close');
  assert.equal(fill.reason,'BOTH_STOP_FIRST');
  assert.equal(fill.model,'next-open-v2');
  assert.equal(fill.entry,fill.key==='dip_reversal'?100.03:99.97);
  assert.ok(fill.net<0);
  assert.equal(accounts.get(fill.key+':4h')?.position,null);
 }
});

test('new model checks timed exits at confirmed candle close',()=>{
 const p=openStrategyPosition('LONG',{time,open:100,high:100.5,low:99.8,close:100.1},100);
 const justBefore={time:time+239*minute,open:100,high:100.5,low:99.8,close:100.1};
 assert.deepEqual(strategyExitAtClose(p,justBefore,240),{price:100.1,reason:'TIME'});
 assert.equal(strategyExitAtClose(p,{...justBefore,time:time+238*minute},240),null);
});

test('legacy active positions keep their original execution model and close timestamp',async()=>{
 const accounts=new Map<string,{balance:number;position:any;last_bar:Date}>();
 for(const key of EXPERIMENT_KEYS)for(const v of EXIT_MODES){
  accounts.set(key+':'+v.id,{balance:100,position:key==='dip_reversal'&&v.id==='4h'?{entry:100,entryAt:time-minute,quantity:0.1,side:'LONG'}:null,last_bar:new Date(time-minute)});
 }
 const fills:unknown[][]=[];
 const client={
  async query(sql:string,params:unknown[]=[]){
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
   if(sql.includes('FROM market_candles'))return {rows:[...bars].reverse()};
   if(sql.startsWith('SELECT balance,position,last_bar FROM v6_paper_accounts'))return {rows:[accounts.get(String(params[0])+':'+String(params[1]))]};
   if(sql.startsWith('INSERT INTO v6_paper_trades')){fills.push(params);return {rows:[]};}
   if(sql.startsWith('UPDATE v6_paper_accounts SET balance=$3'))return {rows:[]};
   throw Error('Unexpected SQL: '+sql);
  },release(){}
 };
 await tickStrategyPaper({connect:async()=>client} as unknown as pg.Pool);
 assert.equal(fills.length,1);
 assert.equal(fills[0][4],time);
 assert.equal(fills[0][9],'legacy-close-v1');
});
