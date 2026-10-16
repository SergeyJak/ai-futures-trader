import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTRACT_RULES,feasibleQuantity} from '../src/contracts.js';

test('all contract symbols reject invalid prices and balances',()=>{
 for(const symbol of Object.keys(CONTRACT_RULES)){
  for(const entry of [0,-1,Number.NaN,Number.POSITIVE_INFINITY])assert.equal(feasibleQuantity(symbol,entry,100),0);
  for(const balance of [0,-1,Number.NaN,Number.NEGATIVE_INFINITY])assert.equal(feasibleQuantity(symbol,100,balance),0);
 }
 assert.equal(feasibleQuantity('INVALID',100,100),0);
});
test('quantities respect exchange step, minimum and available equity including fees',()=>{
 for(const [symbol,rules] of Object.entries(CONTRACT_RULES)){
  for(const price of [1,10,100,1000,10000]){
   for(const equity of [1,10,100,1000]){
    const qty=feasibleQuantity(symbol,price,equity);
    assert.ok(qty>=0,`${symbol} nonnegative`);
    if(!qty)continue;
    assert.ok(qty+1e-9>=rules.minQty);
    assert.ok(Math.abs(qty/rules.qtyStep-Math.round(qty/rules.qtyStep))<1e-6);
    assert.ok(qty*price*(1+.0006)<=equity+1e-8);
    assert.ok(qty*price<=equity*.005/.006+1e-8);
   }
  }
 }
});
test('quantity never increases when equity decreases with fixed risk settings',()=>{
 for(const symbol of Object.keys(CONTRACT_RULES)){
  const quantities=[10,20,50,100,200,500,1000].map(e=>feasibleQuantity(symbol,100,e));
  for(let i=1;i<quantities.length;i++)assert.ok(quantities[i]>=quantities[i-1],`${symbol}: ${quantities}`);
 }
});
test('quantity is zero when balance cannot cover minimum contract and fees',()=>{
 assert.equal(feasibleQuantity('SOLUSDT',100,5),0);
 assert.equal(feasibleQuantity('ETHUSDT',4000,10),0);
 assert.equal(feasibleQuantity('BTCUSDT',100000,50),0);
});
