import {normalize,config,endpointURL} from './shared.js';
import {translate} from './providers.js';
import {lookupWord,validateLookup} from './dictionary.js';
import {createScheduler,cancelled} from './scheduler.js';
const storageReady=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const scheduler=createScheduler(4,2),cache=new Map(),dictionaryCache=new Map(),pending=new Map(),scopes=new Map();
let revision=0;
function scopeFor(msg,sender){
 if(!sender.tab)return null;
 if(typeof msg.session!=='string'||msg.session.length>100||!Number.isInteger(msg.generation)||msg.generation<0)throw new Error('请刷新 YouTube 页面以启用新版插件');
 const id=sender.tab.id;let record=scopes.get(id);
 if(record?.retired.has(msg.session))throw cancelled();
 if(record&&record.session===msg.session&&msg.generation<record.generation)throw cancelled();
 if(!record||record.session!==msg.session||record.generation!==msg.generation){
  const retired=record?.retired||new Set();
  if(record){record.controller.abort();if(record.session!==msg.session)retired.add(record.session);}
  while(retired.size>8)retired.delete(retired.values().next().value);
  record={session:msg.session,generation:msg.generation,controller:new AbortController(),retired,id:id+'|'+msg.session+'|'+msg.generation};scopes.set(id,record);
 }
 return record;
}
function assertScope(scope){if(scope?.controller.signal.aborted)throw cancelled();}
async function settings(){await storageReady;return normalize((await chrome.storage.local.get('settings')).settings);}
async function keyMaker(s){
 const c=config(s),u=endpointURL(c.endpoint),rev=revision;
 if(!await chrome.permissions.contains({origins:[u.origin+'/*']}))throw new Error('请在设置中保存并授权当前接口域名');
 return text=>JSON.stringify([rev,s.provider,s.target,c.endpoint,c.model,text]);
}
function remember(store,key,value,rev){if(revision===rev){store.set(key,value);if(store.size>1200)store.delete(store.keys().next().value);}}
async function run(s,text,scope,background=false){
 const key=(await keyMaker(s))(text),rev=revision;assertScope(scope);
 if(cache.has(key))return cache.get(key);
 // Foreground requests never wait behind an in-flight background batch.
 const pendingKey=(scope?.id||'options')+(background?'|background|':'|live|')+key;
 if(pending.has(pendingKey))return pending.get(pendingKey);
 const promise=scheduler.schedule(()=>{
  assertScope(scope);if(rev!==revision)throw cancelled();if(cache.has(key))return cache.get(key);
  return translate(s,text,fetch,scope?.controller.signal);
 },{signal:scope?.controller.signal,priority:background?2:0,background}).then(result=>{remember(cache,key,result,rev);return result;}).finally(()=>pending.delete(pendingKey));
 pending.set(pendingKey,promise);return promise;
}
async function runBatch(s,texts,scope,near){
 const keyFor=await keyMaker(s),rev=revision;assertScope(scope);
 return scheduler.schedule(async()=>{
  assertScope(scope);if(rev!==revision)throw cancelled();
  const missing=[...new Set(texts)].filter(text=>!cache.has(keyFor(text)));
  if(missing.length){
   const values=await translate(s,missing,fetch,scope?.controller.signal);
   assertScope(scope);missing.forEach((text,i)=>remember(cache,keyFor(text),values[i],rev));
  }
  return texts.map(text=>cache.get(keyFor(text)));
 },{signal:scope?.controller.signal,priority:near?1:2,background:true});
}
async function dictionary(s,word,context,scope){
 const key=(await keyMaker(s))(JSON.stringify(['dictionary',word,context])),rev=revision;assertScope(scope);
 if(dictionaryCache.has(key))return dictionaryCache.get(key);
 const pendingKey=(scope?.id||'options')+'|dictionary|'+key;
 if(pending.has(pendingKey))return pending.get(pendingKey);
 const promise=scheduler.schedule(()=>lookupWord(s,word,context,{signal:scope?.controller.signal}),{signal:scope?.controller.signal,priority:0})
  .then(result=>{assertScope(scope);remember(dictionaryCache,key,result,rev);return result;}).finally(()=>pending.delete(pendingKey));
 pending.set(pendingKey,promise);return promise;
}
function clear(){revision++;cache.clear();dictionaryCache.clear();for(const record of scopes.values())record.controller.abort();}
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes.settings)return;
 const before=normalize(changes.settings.oldValue),after=normalize(changes.settings.newValue);
 if(JSON.stringify([before.provider,before.target,before.profiles])!==JSON.stringify([after.provider,after.target,after.profiles]))clear();
 else if(before.enabled&&!after.enabled)for(const record of scopes.values())record.controller.abort();
});
chrome.tabs.onRemoved.addListener(id=>{scopes.get(id)?.controller.abort();scopes.delete(id);});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 const page=sender.id===chrome.runtime.id&&!sender.tab;
 let youtube=false;try{youtube=sender.id===chrome.runtime.id&&sender.frameId===0&&new URL(sender.url).origin==='https://www.youtube.com';}catch{}
 if(!page&&!youtube)return;
 (async()=>{
  // Register the new playback generation before the first await: old jobs cannot slip back in.
  const scope=msg.type==='getSettings'?null:scopeFor(msg,sender);
  if(msg.type==='setScope')return {ok:true};
  const s=await settings();assertScope(scope);
  if(msg.type==='getSettings'){const {profiles,...safe}=s;return {settings:{...safe,translationRevision:revision}};}
  const started=Date.now();
  if(msg.type==='lookupWord'){
   if(!s.enabled)throw new Error('双语字幕已关闭');
   const {word,context}=validateLookup(msg.word,msg.context);
   return {entry:await dictionary(s,word,context,scope)};
  }
  if(msg.type==='translateBatch'){
   if(!s.enabled)throw new Error('双语字幕已关闭');
   if(!Array.isArray(msg.texts)||!msg.texts.length||msg.texts.length>6||msg.texts.some(t=>typeof t!=='string'||!t.trim())||msg.texts.join('').length>4000)throw new Error('字幕批次无效');
   return {texts:await runBatch(s,msg.texts,scope,msg.near===true),elapsedMs:Date.now()-started};
  }
  if(msg.type==='translate'||(page&&msg.type==='test')){
   if(msg.type==='translate'&&!s.enabled)throw new Error('双语字幕已关闭');
   if(typeof msg.text!=='string'||!msg.text.trim()||msg.text.length>4000)throw new Error('字幕长度无效');
   return {text:await run(s,msg.text.trim(),scope,msg.prefetch===true),elapsedMs:Date.now()-started};
  }
  if(page&&msg.type==='clearCache'){clear();return {ok:true};}
  throw new Error('不支持的操作');
 })().then(reply,e=>reply({error:e.message,cancelled:e.name==='AbortError'}));return true;
});
