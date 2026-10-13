import test from 'node:test';
import assert from 'node:assert/strict';
import {replayV6Exit} from '../src/v6-exit-replay.js';
test('rejects absent confirmed candles',()=>{const result=replayV6Exit({openedMs:1760000000000,side:'LONG',entry:100},[],{kind:'time',minutes:30});assert.equal(result.status,'insufficient_candles')});
