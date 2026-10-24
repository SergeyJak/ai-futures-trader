import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {tickSolShort,SOL_SHORT_VARIANTS,openSolShortPosition} from '../src/sol-short-paper.js';

type Account={balance:number;position:{pendingAt?:number;entry:number;entryAt:number;quantity:number}|null;last_bar:Date};
test('SOL 1m SHORT fills at next minute open, checks entry candle stop and charges costs',async()=>{
 const minute=60000,first=Math.floor(Date.now()/minute)*minute-2*minute;
 const closes=[100,100,100,100.8,100.5,100.4,101.2];
 const bars=closes.map((close,i)=>{const open=i?closes[i-1]:close;return {start_at:new Date(first+(i-5)*minute),open,high:Math.max(open,close)+.1,low:Math.min(open,close)-.1,close}});
 bars[6]={...bars[6],open:100.4,high:102,low:99,close:101.2};
 const accounts=new Map<string,Account>(SOL_SHORT_VARIANTS.map(v=>[v.id,{balance:100,position:null,last_bar:new Date(first-minute)}]));
 const trades:{variant:string;entryAt:number;exitAt:number;entry:number;net:number;reason:string;model:string}[]=[];
 let tick=0;
 const client={async query(sql:string,params:unknown[]=[]){
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.includes('FROM market_candles'))return {rows:bars.slice(tick===0?0:1,tick===0?6:7).reverse()};
  if(sql.startsWith('INSERT INTO sol_short_signal_audit'))return {rows:[]};
  if(sql.startsWith('SELECT balance,position,last_bar FROM sol_short_accounts'))return {rows:[{...accounts.get(String(params[0]))}]};
  if(sql.startsWith('INSERT INTO sol_short_trades')){assert.match(sql,/next-open-v2/);trades.push({variant:String(params[0]),entryAt:Number(params[1]),exitAt:Number(params[2]),entry:Number(params[3]),net:Number(params[5]),reason:String(params[6]),model:'next-open-v2'});return {rows:[]}}
  if(sql.startsWith('UPDATE sol_short_accounts SET balance=')){const a=accounts.get(String(params[0]));assert.ok(a);a.balance=Number(params[1]);a.position=params[2]?JSON.parse(String(params[2])):null;a.last_bar=new Date(Number(params[3]));return {rows:[]}}
  throw Error('Unexpected SQL: '+sql);
 },release(){}};
 const pool={connect:async()=>client} as unknown as pg.Pool;
 await tickSolShort(pool);
 for(const v of SOL_SHORT_VARIANTS)assert.equal(accounts.get(v.id)?.position?.pendingAt,first+minute);
 tick=1;await tickSolShort(pool);
 assert.equal(trades.length,3);
 for(const t of trades){assert.equal(t.entryAt,first+minute);assert.equal(t.exitAt,first+2*minute);assert.equal(t.entry,100.4*(1-.0003));assert.equal(t.reason,'STOP');assert.ok(t.net<0);assert.equal(accounts.get(t.variant)?.position,null);assert.ok((accounts.get(t.variant)?.balance??100)<100)}
});
test('SHORT next-open position uses adverse slippage, not candle close',()=>{
 const bar={time:Date.parse('2026-10-24T00:00:00Z'),open:100};
 assert.deepEqual(openSolShortPosition(bar,100),{entry:99.97,entryAt:bar.time,quantity:10/99.97});
});
test('SHORT legacy trades remain distinguishable in reports',async()=>{
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{queries.push(sql);
  if(sql.includes('FROM sol_short_accounts'))return {rows:SOL_SHORT_VARIANTS.map(v=>({id:v.id,balance:100,position:null,last_bar:null,created_at:null}))};
  if(sql.includes('FROM (SELECT id,variant'))return {rows:[{id:1,variant:'30m',net_pnl:1,execution_model:'legacy-close-v1'},{id:2,variant:'30m',net_pnl:-.5,execution_model:'next-open-v2'}]};
  if(sql.includes('GROUP BY variant'))return {rows:[{variant:'30m',closed_trades:2,realized_net_pnl:.5,wins:1,post_fix_closed:1,post_fix_net:-.5,post_fix_wins:0}]};
  if(sql.includes('FROM sol_short_signal_audit'))return {rows:[{checked:0,signals:0,latest:null}]};
  throw Error(sql);
 }} as unknown as pg.Pool;
 const {solShortReport}=await import('../src/sol-short-paper.js');
 const r=await solShortReport(pool);
 const a=r.variants.find(v=>v.id==='30m');assert.ok(a);
 assert.equal(a.closedTrades,2);assert.equal(a.postFixClosedTrades,1);assert.equal(a.postFixRealizedNetPnl,-.5);
 assert.ok(queries.some(sql=>sql.includes('ROW_NUMBER() OVER (PARTITION BY variant')));
});
