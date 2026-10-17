import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewHtml} from '../src/overview-page.js';

test('paper home defaults to five closed trades, not twenty',()=>{
 assert.match(overviewHtml, /<option value="5" selected>5<\/option>/);
 assert.doesNotMatch(overviewHtml, /<option value="20" selected>/);
});

test('paper home labels small samples and keeps OOS caveat',()=>{
 assert.match(overviewHtml, /Малая выборка/);
 assert.match(overviewHtml, /30–99 сделок/);
 assert.match(overviewHtml, /100\+ сделок/);
 assert.match(overviewHtml, /независимый OOS/);
});
