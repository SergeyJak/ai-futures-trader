import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { V3_CONFIGS } from '../src/v3.js';
import { v3Html } from '../src/v3-page.js';

test('V3 active configuration identities are unique',()=>{assert.equal(new Set(V3_CONFIGS.map(c=>c.id)).size,V3_CONFIGS.length);assert.equal(V3_CONFIGS.length,96);});
test('V3 dashboard defaults to active and offers archived/all',()=>{assert.match(v3Html,/id="activity"/);assert.match(v3Html,/value="active"/);assert.match(v3Html,/value="archived"/);assert.match(v3Html,/value="all"/);});
