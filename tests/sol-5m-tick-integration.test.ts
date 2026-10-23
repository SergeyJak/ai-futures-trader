import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {SOL_5M_VARIANTS,tickSol5m} from '../src/sol-5m-paper.js';

type Position={pendingAt?:number;entry:number;entryAt:number;quantity:number}|null;
type Account={balance:number;position:Position;last_bar:Date};
type Closed={variant:string;entryAt:number;exitAt:number;entry:number;exit:number;pnl:number;reason:string};

async function runEntryMinute(low:number,high:number,close:number){
 const time=Math.floor(Date.now()/60000)*60000-60000;
 const candles=Array.from({length:26},(_,i)=>({
  start_at:new Date(time-(25-i)*60000),open:100,high:100,low:100,close:100
 }));
 Object.assign(candles[25],{low,high,close});
 const accounts=new Map<string,Account>(SOL_5M_VARIANTS.map(v=>[v.id,{
  balance:100,
  position:v.minutes===30?{pendingAt:time,entry:0,entryAt:0,quantity:0}:null,
  last_bar:new Date(time-60000)
 }]));
 const trades:Closed[]=[];
 const commands:string[]=[];
 const client={
  async query(sql:string,params:unknown[]=[]){
   commands.push(sql);
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   if(sql.includes('FROM market_candles'))return {rows:[...candles].reverse()};
   if(sql.startsWith('SELECT balance,position,last_bar FROM sol_5m_accounts')){
    const account=accounts.get(String(params[0]));
    assert.ok(account);
    return {rows:[account]};
   }
   if(sql.startsWith('INSERT INTO sol_5m_trades')){
    trades.push({variant:String(params[0]),entryAt:Number(params[1]),exitAt:Number(params[2]),
     entry:Number(params[3]),exit:Number(params[4]),pnl:Number(params[5]),reason:String(params[6])});
    return {rows:[]};
   }
   if(sql.startsWith('UPDATE sol_5m_accounts SET balance=$2')){
    const id=String(params[0]),account=accounts.get(id);
    assert.ok(account);
    accounts.set(id,{balance:Number(params[1]),
     position:params[2]===null?null:JSON.parse(String(params[2])) as Position,
     last_bar:new Date(Number(params[3]))});
    return {rows:[]};
   }
   throw Error('Unexpected SQL: '+sql);
  },
  release(){}
 };
 const pool={connect:async()=>client} as unknown as pg.Pool;
 await tickSol5m(pool);
 assert.ok(commands.includes('COMMIT'));
 assert.ok(!commands.includes('ROLLBACK'));
 return {time,accounts,trades};
}

test('SOL 5m LONG/SHORT fills at next open, stops on entry minute and charges costs',async()=>{
 // Both stop and take levels are crossed: conservative stop-first rule applies.
 const {time,accounts,trades}=await runEntryMinute(97,103,100);
 assert.equal(trades.length,2);
 assert.deepEqual(trades.map(t=>t.variant).sort(),['LONG-30m','SHORT-30m']);
 for(const t of trades){
  assert.equal(t.entryAt,time);
  assert.equal(t.exitAt,time+60000);
  assert.equal(t.reason,'STOP');
  assert.ok(t.pnl<0,'net PnL includes adverse fill and fees');
  assert.equal(accounts.get(t.variant)?.position,null);
  assert.ok((accounts.get(t.variant)?.balance??100)<100);
 }
 assert.equal(trades.find(t=>t.variant==='LONG-30m')?.entry,100.03);
 assert.equal(trades.find(t=>t.variant==='SHORT-30m')?.entry,99.97);
 for(const v of SOL_5M_VARIANTS.filter(v=>v.minutes!==30))
  assert.equal(accounts.get(v.id)?.position,null,'other variants remain isolated');
});

test('SOL 5m keeps new positions open when entry candle touches no exit',async()=>{
 const {time,accounts,trades}=await runEntryMinute(99.8,100.2,100.1);
 assert.equal(trades.length,0);
 for(const id of ['LONG-30m','SHORT-30m']){
  const a=accounts.get(id);
  assert.equal(a?.balance,100);
  assert.equal(a?.position?.entryAt,time);
  assert.ok((a?.position?.quantity??0)>0);
  assert.equal(a?.position?.pendingAt,undefined);
 }
});
