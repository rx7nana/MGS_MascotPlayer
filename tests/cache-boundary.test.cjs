const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
test('pending PCM is delivered at a covered-cache boundary for five tail sizes',async()=>{
 const root=path.resolve(__dirname,'..');const source=fs.readFileSync(path.join(root,'src/priority-worker-v021.js'),'utf8');
 const helpers=await import(pathToFileURL(path.join(root,'src/pcm-ranges-v022.js')));
 for(const tail of [1024,2048,12288,23552,24576]){
  const sent=[];const ctx=vm.createContext({...helpers,Int16Array,postMessage:m=>{if(m.part)sent.push(m.part)}});
  vm.runInContext('let ranges=[];'+source.slice(source.indexOf('function flush(c)'),source.indexOf('function knownEnd(c)'))+';globalThis.api={add,flush,set:r=>ranges=r,get:()=>ranges}',ctx);
  const api=ctx.api,start=0,island=24576*2+tail;api.set([[island,island+24576*3]]);
  const c={start:0,count:0,pieces:[],rows:[]};const sample=i=>((i*17)%65535)-32767;
  for(let off=start;off<island+24576*2;off+=1024)api.add(c,off,Int16Array.from({length:1024},(_,i)=>sample(off+i)),[]);
  assert(helpers.containsRange(api.get(),start,island+24576*2));assert.equal(c.count,0);
  let count=0;for(const p of sent){for(let i=0;i<p.pcm.length;i++)assert.equal(p.pcm[i],sample(p.offset+i));count+=p.pcm.length;}
  assert.equal(count,island);const n=sent.length;
  for(let off=island;off<island+24576;off+=1024)api.add(c,off,new Int16Array(1024),[]);
  assert.equal(sent.length,n);
 }
});
