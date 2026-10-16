import test from 'node:test';import assert from 'node:assert/strict';
import {unifiedHeader} from '../src/unified-header.js';
import {overviewHtml} from '../src/overview-page.js';
test('focused menu prioritizes progress and preserves legacy pages only in archive',()=>{
 assert.match(unifiedHeader,/<a href="\/research-progress">Прогресс исследований<\/a>/);
 assert.match(unifiedHeader,/<summary>Архив и диагностика/);
 assert.match(unifiedHeader,/<a href="\/dashboard">V1 \/ V2 · Архив<\/a>/);
 assert.equal((unifiedHeader.match(/<nav /g)||[]).length,1);
 assert.equal((unifiedHeader.match(/<\/nav>/g)||[]).length,1);
});
test('overview links to progress without duplicate legacy navigation',()=>{
 assert.match(overviewHtml,/Смотреть прогресс/);
 assert.doesNotMatch(overviewHtml,/Подробные разделы и диагностика/);
 assert.match(overviewHtml,/api\/v3/);
});
