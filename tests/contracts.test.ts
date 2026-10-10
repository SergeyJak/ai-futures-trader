import test from 'node:test';
import assert from 'node:assert/strict';
import {feasibleQuantity} from '../src/contracts.js';
test('BTC below min 0.001 is rejected',()=>assert.equal(feasibleQuantity('BTCUSDT',100000,100),0));
test('BTC at current price can use exactly 0.001',()=>assert.equal(feasibleQuantity('BTCUSDT',82645,100),0.001));
test('ETH quantity rounds down to 0.01',()=>assert.equal(feasibleQuantity('ETHUSDT',2492.55,100),0.03));
test('SOL rounds to 0.1',()=>assert.equal(feasibleQuantity('SOLUSDT',109.7,100),0.7));
test('fees leave enough margin',()=>assert.equal(feasibleQuantity('SOLUSDT',99.99,10),0));
