import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingOnlyHoldingStyles} from '../src/v6-cohort-oos.js';
test('empty sample has no holding styles',()=>assert.equal(trainingOnlyHoldingStyles([],1000).size,0));
