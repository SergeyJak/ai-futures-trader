import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTrader,analyzeHoldingStyles,netReturn,holdingHours} from '../src/v6-holding-styles.js';
const position=(traderId:string,hours:number,exitPrice=101)=>({traderId,openedAt:'2026-10-01T00:00:00Z',closedAt:new Date(Date.parse('2026-10-01T00:00:00Z')+hours*3600000),side:'LONG' as const,entryPrice:100,exitPrice});
test('styles derive from median of closed positions',()=>{
 assert.equal(classifyTrader(Array.from({length:5},()=>position('a',2))).style,'intraday');
 assert.equal(classifyTrader(Array.from({length:5},()=>position('a',24))).style,'swing');
 assert.equal(classifyTrader(Array.from({length:5},()=>position('a',72))).style,'multiday');
 assert.equal(classifyTrader([position('a',72)]).style,'insufficient');
});
test('net result deducts two fees and adverse slippage',()=>{
 const gross=.01,net=netReturn(position('a',24));
 assert.ok(net!==null&&net<gross);
 assert.ok(netReturn(position('a',24),{feePerSide:0,slippagePerSide:0})===gross || Math.abs(netReturn(position('a',24),{feePerSide:0,slippagePerSide:0})!-gross)<1e-12);
});
test('invalid or unclosed positions cannot enter cohort statistics',()=>{
 assert.equal(holdingHours({...position('a',1),closedAt:'invalid'}),null);
 const rows=analyzeHoldingStyles([...Array.from({length:5},()=>position('a',72)),{...position('a',1),closedAt:'invalid'}]);
 assert.equal(rows[0].closedCount,5);
 assert.equal(rows[0].style,'multiday');
});
test('funding costs and losses are reflected',()=>{
 const p=position('a',72,99);
 assert.ok(netReturn({...p,fundingRateCost:.001})!<netReturn(p)!);
 const rows=analyzeHoldingStyles(Array.from({length:5},()=>p));
 assert.equal(rows[0].winRate,0);
 assert.equal(rows[0].profitFactor,0);
});
