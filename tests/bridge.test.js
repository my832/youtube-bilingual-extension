import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../subtitle-core.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../subtitle-bridge.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(selected=false){
 const posted=[],requests=[];let listener;
 const body=JSON.stringify({events:[{tStartMs:0,dDurationMs:2000,segs:[{utf8:'Hello'}]}]});
 const response=(text=body,ok=true)=>({ok,text:async()=>text,clone(){return this;}});
 const fetch=async(url)=>{requests.push(String(url));return response();};
 const window={fetch,postMessage:msg=>posted.push(msg),addEventListener:(type,fn)=>listener=fn};
 class XHR{open(){}send(){}addEventListener(){}}
 const player=selected?{getOption:()=>({languageCode:'en',vssId:'.en'}),getPlayerResponse:()=>({videoDetails:{videoId:'one'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',vssId:'.en',baseUrl:'https://www.youtube.com/api/timedtext?v=one&lang=en'}]}}})}:null;
 const context=vm.createContext({window,XMLHttpRequest:XHR,URL,AbortController,setTimeout,clearTimeout,location:{href:'https://www.youtube.com/watch?v=one',origin:'https://www.youtube.com'},document:{querySelector:()=>player},Date,console});
 vm.runInContext(core,context);vm.runInContext(source,context);
 return {posted,requests,window,response,enable:()=>listener({source:window,origin:'https://www.youtube.com',data:{source:'yb-caption-control',enabled:true}})};
}
test('bridge preserves signed track URL and publishes timed cues',async()=>{
 const f=fixture(true);f.enable();await flush();
 assert.equal(f.requests[0],'https://www.youtube.com/api/timedtext?v=one&lang=en');
 const message=f.posted.find(m=>m.kind==='cues');assert.equal(message.videoId,'one');assert.equal(message.cues[0].text,'Hello');assert.equal(message.cues[0].end,2);
});
test('bridge captures real player caption fetch without changing its response',async()=>{
 const f=fixture();f.enable();await flush();
 const result=await f.window.fetch('https://www.youtube.com/api/timedtext?v=one&lang=en');await flush();
 assert.equal(result.ok,true);assert.equal(f.posted.find(m=>m.kind==='cues').cues[0].text,'Hello');
});
test('bridge buffers early native captions without publishing until enabled, and ignores other origins/videos',async()=>{
 const f=fixture();await f.window.fetch('https://www.youtube.com/api/timedtext?v=one&lang=en');await flush();assert.equal(f.posted.length,0);
 f.enable();await flush();
 await f.window.fetch('https://example.com/api/timedtext?v=one&lang=en');await f.window.fetch('https://www.youtube.com/api/timedtext?v=two&lang=en');await flush();
 assert.ok(f.posted.filter(m=>m.kind==='cues').length>=1);
 assert.ok(f.posted.filter(m=>m.kind==='cues').every(m=>m.videoId==='one'));
});
