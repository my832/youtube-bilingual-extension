import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createScheduler} from '../scheduler.js';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};}
test('background batches cannot consume reserved current-caption capacity',async()=>{
 const s=createScheduler(4,2),jobs=Array.from({length:4},deferred),started=[];
 const tasks=jobs.map((j,i)=>s.schedule(()=>{started.push(i);return j.promise;},{background:true,priority:2}));await flush();assert.deepEqual(started,[0,1]);
 const urgent=s.schedule(async()=>{started.push('current');return 'now';});assert.equal(await urgent,'now');assert.ok(started.includes('current'));
 jobs.forEach(j=>j.resolve('ok'));await Promise.all(tasks);
});
test('seeking cancels queued old work and aborts active fetch work',async()=>{
 const s=createScheduler(1,1),old=new AbortController();let queuedStarted=false;
 const active=s.schedule(()=>new Promise((resolve,reject)=>old.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true})),{signal:old.signal});
 const queued=s.schedule(()=>{queuedStarted=true;},{signal:old.signal});
 const checks=[assert.rejects(active,{name:'AbortError'}),assert.rejects(queued,{name:'AbortError'})];await flush();old.abort();await Promise.all(checks);
 assert.equal(queuedStarted,false);assert.equal(await s.schedule(async()=> 'new position'),'new position');
});
