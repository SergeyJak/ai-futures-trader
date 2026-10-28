import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {collectOkxHistory,okxInvalidClosedReason,validateOkxClosed} from '../src/okx-history.js';

const valid={
 subPosId:'position-1',openTime:'1700000000000',closeTime:'1700000060000',
 openAvgPx:'100',closeAvgPx:'101',posSide:'long'
};

test('OKX closed-history validator rejects non-finite prices without changing valid rows',()=>{
 assert.equal(okxInvalidClosedReason(valid),null);
 assert.equal(validateOkxClosed(valid),true);
 assert.equal(okxInvalidClosedReason({...valid,openAvgPx:'Infinity'}),'invalid_entry_price');
 assert.equal(okxInvalidClosedReason({...valid,closeAvgPx:'Infinity'}),'invalid_exit_price');
 assert.equal(okxInvalidClosedReason({...valid,closeAvgPx:'NaN'}),'invalid_exit_price');
 assert.equal(validateOkxClosed({...valid,openAvgPx:'Infinity'}),false);
 assert.equal(okxInvalidClosedReason({...valid,subPosId:''}),'missing_position_id');
 assert.equal(okxInvalidClosedReason({...valid,closeTime:'1'}),'invalid_close_time');
 assert.equal(okxInvalidClosedReason({...valid,posSide:'unknown'}),'invalid_side');
});

test('OKX collector reports aggregated rejection reasons without persisting invalid rows',async()=>{
 const originalFetch=globalThis.fetch;
 const rows=[valid,{...valid,subPosId:'bad-entry',openAvgPx:'Infinity'},{...valid,subPosId:'bad-side',posSide:'unknown'}];
 const writes:string[]=[];
 const pool={query:async(sql:string)=>{
  if(sql.includes('INSERT INTO v6_okx_history'))writes.push(sql);
  return {rowCount:1};
 }} as unknown as pg.Pool;
 globalThis.fetch=(async()=>({ok:true,status:200,json:async()=>({code:'0',data:rows})})) as unknown as typeof fetch;
 try{
  const result=await collectOkxHistory(pool,['ABCDEFGHIJKLMNOP'],1);
  assert.equal(result.insertedClosed,1);
  assert.equal(result.invalid,2);
  assert.deepEqual(result.invalidReasons,{invalid_entry_price:1,invalid_side:1});
  assert.deepEqual(result.errors,[]);
  assert.equal(writes.length,1);
 }finally{globalThis.fetch=originalFetch;}
});
