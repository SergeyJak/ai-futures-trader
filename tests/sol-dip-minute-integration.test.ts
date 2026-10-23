import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {tickSolPaper,SOL_VARIANTS} from '../src/sol-dip-paper.js';

test('SOL 1m forward execution fills at next open and honors first-minute stop with costs',async()=>{
 const minute=60000;
 const first=Math.floor(Date.now()/minute)*minute-2*minute;
 const closes=[100.5,100.4,100,99.8,99.2,99.5,98.5];
 const bars=closes.map((close,i)=>{
  const open=i?closes[i-1]:close;
  return {start_at:new Date(first+(i-5)*minute),open,
   high:Math.max(open,close)+0.1,low:Math.min(open,close)-0.1,close};
 });
 // Entry minute has an intraminute stop, even though the signal was confirmed on the previous candle.
 bars[6]={...bars[6],open:99.5,high:99.6,low:98.0,close:98.5};
 const accounts=new Map(SOL_VARIANTS.map(v=>[v.id,{
  balance:100,position:null as Record<string,number>|null,last_bar:new Date(first-minute)
 }] as const));
 const closed:{variant:string;entryAt:number;exitAt:number;entry:number;exit:number;net:number;reason:string}[]=[];
 let tick=0;
 const client={
  query:async(sql:string,params:unknown[]=[])=>{
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   if(sql.includes('FROM market_candles')){
    const window=bars.slice(tick===0?0:1,tick===0?6:7);
    return {rows:window.slice().reverse()};
   }
   if(sql.startsWith('INSERT INTO sol_dip_signal_audit'))return {rows:[]};
   if(sql.startsWith('SELECT balance,position,last_bar FROM sol_dip_accounts')){
    const row=accounts.get(params[0] as string);
    if(!row)throw Error('missing account');
    return {rows:[{...row}]};
   }
   if(sql.startsWith('UPDATE sol_dip_accounts SET balance=')){
    const row=accounts.get(params[0] as string);
    if(!row)throw Error('missing account');
    row.balance=Number(params[1]);
    row.position=params[2]?JSON.parse(String(params[2])):null;
    row.last_bar=new Date(Number(params[3]));
    return {rows:[]};
   }
   if(sql.startsWith('INSERT INTO sol_dip_trades')){
    closed.push({variant:String(params[0]),entryAt:Number(params[1]),exitAt:Number(params[2]),
     entry:Number(params[3]),exit:Number(params[4]),net:Number(params[5]),reason:String(params[6])});
    return {rows:[]};
   }
   throw Error('unexpected SQL: '+sql);
  },
  release:()=>{}
 };
 const pool={connect:async()=>client} as unknown as pg.Pool;
 await tickSolPaper(pool);
 for(const v of SOL_VARIANTS){
  const p=accounts.get(v.id)?.position;
  assert.equal(p?.pendingAt,first+minute);
 }
 tick=1;
 await tickSolPaper(pool);
 assert.equal(closed.length,3);
 for(const v of SOL_VARIANTS){
  const trade=closed.find(t=>t.variant===v.id);
  assert.ok(trade);
  assert.equal(trade.entryAt,first+minute);
  assert.equal(trade.exitAt,first+2*minute);
  assert.equal(trade.entry,99.5*1.0003);
  assert.equal(trade.reason,'STOP');
  assert.ok(trade.net<0,'net PnL includes fees and slippage');
  assert.equal(accounts.get(v.id)?.position,null);
  assert.ok((accounts.get(v.id)?.balance??100)<100);
 }
});
