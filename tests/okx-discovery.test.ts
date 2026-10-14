import test from 'node:test';import assert from 'node:assert/strict';import {extractOkxTraderCodes,discoverOkxTraderCodes} from '../src/okx-discovery.js';
const a='ABCDEFGHIJKLMNOP',b='123456789012345678';
test('accept only public lead ranking codes, deduplicate and bound',()=>{assert.deepEqual(extractOkxTraderCodes({code:'0',data:[{ranks:[{uniqueCode:a},{uniqueCode:a},{uniqueCode:'bad'},{uniqueCode:b}]}]},2),[a,b])});
test('reject invalid payload and private-shaped records',()=>{assert.deepEqual(extractOkxTraderCodes({code:'500',data:[{ranks:[{uniqueCode:a}]}]}),[]);assert.deepEqual(extractOkxTraderCodes({code:'0',data:[{uniqueCode:a}]}),[])});
test('fetch public leaderboard once',async()=>{let calls=0;const mock=(async()=>{calls++;return {ok:true,json:async()=>({code:'0',data:[{ranks:[{uniqueCode:a}]}]})}}) as unknown as typeof fetch;assert.deepEqual(await discoverOkxTraderCodes(mock),[a]);assert.equal(calls,1)});
