import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyV6EntryPattern} from '../src/v6-entry-study.js';
test('classifies directional reversals and continuation',()=>{
 assert.equal(classifyV6EntryPattern('LONG',99,98,100),'dip_reversal');
 assert.equal(classifyV6EntryPattern('LONG',98,99,100),'dip_continuation');
 assert.equal(classifyV6EntryPattern('SHORT',101,102,100),'dip_reversal');
 assert.equal(classifyV6EntryPattern('SHORT',102,101,100),'dip_continuation');
 assert.equal(classifyV6EntryPattern('LONG',102,101,100),'momentum_continuation');
 assert.equal(classifyV6EntryPattern('LONG',102,103,100),'momentum_pullback');
 assert.equal(classifyV6EntryPattern('SHORT',98,99,100),'momentum_continuation');
 assert.equal(classifyV6EntryPattern('SHORT',98,97,100),'momentum_pullback');
});
test('rejects missing and flat input',()=>{
 assert.equal(classifyV6EntryPattern('LONG',99,null,100),'unknown');
 assert.equal(classifyV6EntryPattern('LONG',99,99,100),'flat');
 assert.equal(classifyV6EntryPattern('LONG',100,99,100),'flat');
});
