import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const path of ['src/sol-dip-paper.ts','src/sol-short-paper.ts'])test(`${path} bounds historical chart requests`,()=>{const source=readFileSync(path,'utf8');const method=source.slice(source.indexOf('export async function '+(path.includes('short')?'solShortTradeCandles':'solTradeCandles')),source.indexOf('export async function '+(path.includes('short')?'solShortActiveTradeCandles':'solActiveTradeCandles')));assert.match(method,/GREATEST\(\$1::timestamptz-interval '10 minutes',\$2::timestamptz-interval '24 hours'\)/);assert.match(method,/ORDER BY start_at DESC LIMIT 1500/);assert.match(method,/candles\.rows\.reverse\(\)/)});
