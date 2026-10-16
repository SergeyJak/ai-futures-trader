import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeOos} from '../src/entry-filter-decision.js';
import type {FilterScore} from '../src/entry-filter-oos.js';
const base:FilterScore={name:'downtrend',trainTrades:50,testTrades:40,trainNet:10,trainMean:.2,trainBaselineMean:-.1,selectedOnTrain:true,testNet:8,testMean:.2,baselineNet:-4,baselineTrades:80,baselineMean:-.05,netVsBaseline:10,coverage:.5,eligible:true};
test('OOS decision only nominates positive and independently verified filter',()=>{
 assert.equal(summarizeOos([base])[0].decision,'candidate-for-paper');
 assert.equal(summarizeOos([{...base,selectedOnTrain:false}])[0].decision,'reject');
 assert.equal(summarizeOos([{...base,eligible:false}])[0].decision,'insufficient-data');
 assert.equal(summarizeOos([{...base,testNet:-1}])[0].decision,'reject');
 assert.equal(summarizeOos([{...base,netVsBaseline:-1}])[0].decision,'reject');
 assert.equal(summarizeOos([{...base,name:'baseline'}])[0].decision,'baseline');
});
