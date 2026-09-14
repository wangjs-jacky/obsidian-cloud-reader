import test from 'node:test'
import assert from 'node:assert/strict'
import { scanProgress } from '../web/progress.mjs'
test('unknown first scan remains indeterminate instead of inventing percent',()=>{const p=scanProgress({refreshing:true,scanned:1000,pages:1,previousTotal:0});assert.equal(p.value,null);assert.match(p.detail,/1,000/);assert.equal(p.mode,'loading')})
test('known prior total is an estimate capped below completion',()=>{assert.equal(scanProgress({refreshing:true,scanned:1000,previousTotal:10000}).value,10);assert.equal(scanProgress({refreshing:true,scanned:12000,previousTotal:10000}).value,95);assert.equal(scanProgress({updatedAt:1,noteCount:5812}).value,100)})
test('failed scan stops animation and retains old catalog message',()=>{const p=scanProgress({error:'network',updatedAt:1,scanned:3000});assert.equal(p.mode,'error');assert.equal(p.value,null);assert.match(p.detail,/原有目录/)} )
