import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalize,config,endpointURL} from '../shared.js';
import {createScheduler,cancelled} from '../scheduler.js';
import {validateLookup} from '../dictionary.js';
const source=readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){
 let listener,change;const jobs=[];const s=normalize({enabled:true,profiles:{microsoft:{key:'secret'}}});
 const chrome={runtime:{id:'ext',onMessage:{addListener:fn=>listener=fn}},permissions:{contains:async()=>true},tabs:{onRemoved:{addListener(){}}},storage:{local:{setAccessLevel:async()=>{},get:async()=>({settings:s})},onChanged:{addListener:fn=>change=fn}}};
 const translate=(settings,text,fetch,signal)=>new Promise((resolve,reject)=>{
  const job={text,resolve,aborted:false};jobs.push(job);
  const stop=()=>{job.aborted=true;reject(new DOMException('cancelled','AbortError'));};if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
 });
 vm.runInNewContext(source,{chrome,normalize,config,endpointURL,translate,lookupWord:async()=>({translation:'test'}),validateLookup,createScheduler,cancelled,AbortController,URL,Date,fetch:()=>{},console});
 const sender={id:'ext',tab:{id:1},frameId:0,url:'https://www.youtube.com/watch?v=test'};
 return {jobs,settings:s,change,send:msg=>new Promise(resolve=>listener({session:'page',generation:1,...msg},sender,resolve))};
}
test('new seek generation cancels old fetch and immediately starts new-position work',async()=>{
 const f=fixture();const old=f.send({type:'translateBatch',texts:['old future']});await flush();assert.equal(f.jobs.length,1);
 const next=f.send({type:'translate',text:'new position',generation:2});await flush();assert.equal(f.jobs[0].aborted,true);assert.equal(f.jobs.at(-1).text,'new position');
 assert.equal((await old).cancelled,true);f.jobs.at(-1).resolve('新位置');assert.equal((await next).text,'新位置');
});
test('foreground request does not join a slow background batch for the same text',async()=>{
 const f=fixture();const batch=f.send({type:'translateBatch',texts:['same text']});await flush();const urgent=f.send({type:'translate',text:'same text'});await flush();
 assert.equal(f.jobs.length,2);f.jobs[1].resolve('立即译文');assert.equal((await urgent).text,'立即译文');f.jobs[0].resolve(['预取译文']);await batch;
});
test('appearance storage updates do not cancel or clear completed translation cache',async()=>{
 const f=fixture(),old=structuredClone(f.settings),request=f.send({type:'translate',text:'hello'});await flush();f.jobs[0].resolve('你好');await request;
 f.settings.fontSize=40;f.settings.backgroundOpacity=0;f.change({settings:{oldValue:old,newValue:f.settings}},'local');
 assert.equal((await f.send({type:'translate',text:'hello',generation:2})).text,'你好');assert.equal(f.jobs.length,1);
});
