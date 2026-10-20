const {test}=require('node:test');const assert=require('node:assert/strict');
const {resolveMetadata,numeric}=require('../src/metadata.cjs');
test('metadata overrides player defaults and clamps fade to duration',()=>{
 const r=resolveMetadata(';[duration=1000ms fade=5s gain=0.75]\n', {duration:300,gain:1});
 assert.equal(r.values.duration,1);assert.equal(r.values.fade,1);assert.equal(r.values.gain,.75);assert.equal(r.origin.gain,'MML');
});
test('invalid gain preserves player setting',()=>{
 assert.equal(numeric('gain',5),null);assert.equal(resolveMetadata(';[gain=5]',{gain:.5}).values.gain,.5);
});
