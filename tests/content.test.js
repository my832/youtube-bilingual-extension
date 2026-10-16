import {FakeNode,walk,fakeDocument} from './fake-dom.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../subtitle-core.js',import.meta.url),'utf8');
const dictionaryUI=readFileSync(new URL('../dictionary-ui.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../content.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 const state={text:'Hello',cc:'true',id:'one',time:1,clock:Date.now(),enabled:true,requests:[],timers:[],interval:null};
 const node=()=>new FakeNode();
 const container=node();const attrs=new Map();
 container.hasAttribute=k=>attrs.has(k);container.setAttribute=(k,v)=>attrs.set(k,v);container.getAttribute=k=>attrs.get(k);container.removeAttribute=k=>attrs.delete(k);
 const video={get currentTime(){return state.time;},get seeking(){return state.seeking||false;},ended:false};
 const player=node();player.querySelector=s=>s==='video'?video:s==='.ytp-subtitles-button'?{getAttribute:()=>state.cc}:container;
 player.querySelectorAll=()=>state.text?[{textContent:state.text}]:[];
 const document=fakeDocument();document.querySelector=()=>player;
 let messageListener;
 const chrome={runtime:{id:'test',sendMessage:async msg=>{
  if(msg.type==='getSettings')return {settings:{enabled:state.enabled,fontSize:24,translationFontSize:21,backgroundOpacity:82,bottom:12,prefetchSeconds:90,translationRevision:0}};
  if(msg.type==='setScope')return {ok:true};
  return new Promise(resolve=>state.requests.push({type:msg.type,text:msg.text,texts:msg.texts,word:msg.word,generation:msg.generation,resolve}));
 },onMessage:{addListener(fn){messageListener=fn;}}}};
 let bridgeListener;
 const window={postMessage(){},addEventListener(type,fn){if(type==='message')bridgeListener=fn;}};
 const context=vm.createContext({document,chrome,window,URL,location:{origin:'https://www.youtube.com',get href(){return 'https://www.youtube.com/watch?v='+state.id;}},setInterval:fn=>(state.interval=fn),clearInterval(){},Date:{now:()=>state.clock},console});
 vm.runInContext(core,context);vm.runInContext(dictionaryUI,context);vm.runInContext(source,context);
 state.deliver=(data)=>bridgeListener({source:window,origin:'https://www.youtube.com',data:{source:'yb-caption-bridge',videoId:state.id,track:'en||',sequence:1,kind:'cues',...data}});

 const overlay=()=>player.children.find(n=>n.id==='yt-bilingual-overlay');
 return {state,container,overlay,player,document,message:msg=>messageListener(msg,{id:'test'},()=>{}),step(){state.interval();const timers=state.timers.splice(0);timers.forEach(fn=>fn());},refresh:()=>messageListener({type:'refresh'})};
}
test('captions render original above translation and restore native caption on disable',async()=>{
 const f=fixture();await flush();f.step();await flush();assert.equal(f.state.requests[0].text,'Hello');
 f.state.requests[0].resolve({text:'你好'});await flush();
 assert.equal(f.overlay().shadow.children[1].textContent,'Hello');assert.equal(f.overlay().shadow.children[2].textContent,'你好');
 assert.equal(f.container.style.opacity,'0');
 f.state.enabled=false;f.refresh();await flush();f.step();assert.equal(f.container.style.opacity,'');assert.equal(f.overlay().hidden,true);
});
test('video navigation invalidates late translation and uses newest caption',async()=>{
 const f=fixture();await flush();f.step();await flush();
 f.state.id='two';f.state.text='Goodbye';f.step();await flush();
 f.state.requests[0].resolve({text:'旧译文'});await flush();
 assert.notEqual(f.overlay().shadow.children[2].textContent,'旧译文');
 assert.equal(f.state.requests[1].text,'Goodbye');
 f.state.requests[1].resolve({text:'再见'});await flush();assert.equal(f.overlay().shadow.children[2].textContent,'再见');
});
test('current caption bypasses slow previous caption with bounded parallelism',async()=>{
 const f=fixture();await flush();f.step();await flush();
 f.state.text='Second';f.step();f.state.text='Third';f.step();
 assert.equal(f.state.requests.length,2);
 assert.equal(f.state.requests[1].text,'Second');
 f.state.requests[0].resolve({text:'你好'});await flush();
 assert.equal(f.state.requests.length,3);assert.equal(f.state.requests[2].text,'Third');
});
test('CC off restores native captions and rejects late display',async()=>{
 const f=fixture();await flush();f.step();await flush();
 f.state.cc='false';f.step();f.state.requests[0].resolve({text:'不应显示'});await flush();
 assert.equal(f.container.style.opacity,'');assert.notEqual(f.overlay().shadow.children[2].textContent,'不应显示');
});

test('lookahead prepares future translation before playback reaches it',async()=>{
 const f=fixture();await flush();
 f.state.deliver({cues:[{start:0,end:2,text:'Hello'},{start:2,end:4,text:'Next sentence'},{start:40,end:42,text:'Too far'}]});
 await flush();
 const batch=f.state.requests.find(r=>r.texts);assert.deepEqual(Array.from(batch.texts),['Next sentence','Too far']);
 batch.resolve({texts:['下一句','更后面']});await flush();
 const count=f.state.requests.length;f.state.time=2.2;f.step();await flush();
 assert.equal(f.overlay().shadow.children[1].textContent,'Next sentence');
 assert.equal(f.overlay().shadow.children[2].textContent,'下一句');assert.equal(f.state.requests.length,count);
});
test('a language switch drops late prefetched translations',async()=>{
 const f=fixture();await flush();
 f.state.deliver({cues:[{start:0,end:2,text:'Hello'},{start:2,end:4,text:'Next'}]});await flush();
 const batch=f.state.requests.find(r=>r.texts);
 f.state.deliver({kind:'track',track:'ja||'});
 batch.resolve({texts:['旧语种译文']});await flush();
 assert.notEqual(f.overlay().shadow.children[2].textContent,'旧语种译文');
});
test('without a downloadable track, native DOM captions still translate immediately',async()=>{
 const f=fixture();await flush();
 assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].text,'Hello');
 assert.equal(f.state.requests.some(r=>r.texts),false);
});

test('seeking issues new-position foreground and lookahead while old batches remain unresolved',async()=>{
 const f=fixture();await flush();f.state.deliver({cues:[{start:0,end:2,text:'Hello'},{start:2,end:4,text:'Old future'},{start:100,end:102,text:'New position'},{start:102,end:104,text:'New future'}]});await flush();
 const oldBatch=f.state.requests.find(r=>r.texts);
 f.state.time=100;f.step();await flush();
 const live=f.state.requests.find(r=>r.text==='New position');const next=f.state.requests.find(r=>r.texts?.includes('New future'));
 assert.ok(live);assert.ok(next);assert.ok(live.generation>oldBatch.generation);
 oldBatch.resolve({texts:['过期译文']});await flush();assert.notEqual(f.overlay().shadow.children[2].textContent,'过期译文');
});
test('clicking original words queries once; hover and translation line never query',async()=>{
 const f=fixture();await flush();const original=f.overlay().shadow.children[1],translated=f.overlay().shadow.children[2];
 const word=walk(original,n=>n.tagName==='BUTTON');assert.ok(word);
 const before=f.state.requests.length;word.dispatchEvent(new Event('pointerover'));word.dispatchEvent(new Event('mouseover'));assert.equal(f.state.requests.length,before);
 word.dispatchEvent(new Event('click',{cancelable:true}));await flush();
 const lookups=f.state.requests.filter(r=>r.type==='lookupWord');assert.equal(lookups.length,1);assert.equal(lookups[0].word,'Hello');
 assert.equal(walk(translated,n=>n.tagName==='BUTTON'),null);
 lookups[0].resolve({entry:{translation:'你好',explanation:'表示问候',example:'Hello, friend.',source:'test'}});await flush();
 const panel=f.player.children.find(n=>n.id==='yt-bilingual-dictionary');assert.equal(panel.hidden,false);assert.match(panel.shadow.textContent,/表示问候/);
});
test('independent fonts and zero opacity apply immediately without resetting translation',async()=>{
 const f=fixture();await flush();const before=f.state.requests.length;
 f.message({type:'appearancePreview',appearance:{fontSize:40,translationFontSize:18,backgroundOpacity:0,bottom:20}});
 assert.equal(f.overlay().style['--yb-original-font-size'],'40px');assert.equal(f.overlay().style['--yb-translation-font-size'],'18px');assert.equal(f.overlay().style['--yb-bg-alpha'],'0');assert.equal(f.overlay().style.bottom,'20%');
 assert.equal(f.state.requests.length,before);assert.equal(f.overlay().shadow.children[1].textContent,'Hello');
});

test('closing dictionary suppresses a late reply without reopening the panel',async()=>{
 const f=fixture();await flush();const word=walk(f.overlay().shadow.children[1],n=>n.tagName==='BUTTON');word.dispatchEvent(new Event('click',{cancelable:true}));await flush();
 const request=f.state.requests.find(r=>r.type==='lookupWord'),panel=f.player.children.find(n=>n.id==='yt-bilingual-dictionary');
 const close=walk(panel,n=>n.getAttribute('aria-label')==='关闭词典');close.dispatchEvent(new Event('click'));
 request.resolve({entry:{translation:'延迟结果',explanation:'不应重新打开'}});await flush();assert.equal(panel.hidden,true);assert.doesNotMatch(panel.shadow.textContent,/不应重新打开/);
});

test('normal progress after a throttled background timer is not mistaken for a seek',async()=>{
 const f=fixture();await flush();const first=f.state.requests[0];
 f.state.clock+=10000;f.state.time+=10;f.step();await flush();
 assert.equal(f.state.requests.filter(r=>r.type==='translate').length,1);
 first.resolve({text:'延迟返回但仍属于当前字幕'});await flush();
 assert.equal(f.overlay().shadow.children[2].textContent,'延迟返回但仍属于当前字幕');
});

test('settled seek target pretranslates while the video is still buffering',async()=>{
 const f=fixture();await flush();f.state.deliver({cues:[{start:0,end:2,text:'Hello'},{start:2,end:4,text:'Old future'},{start:100,end:102,text:'Buffering target'},{start:102,end:104,text:'After target'}]});await flush();
 f.state.seeking=true;f.state.time=100;f.step();await flush();
 assert.equal(f.state.requests.some(r=>r.text==='Buffering target'),false);
 f.state.clock+=300;f.step();await flush();
 assert.ok(f.state.requests.some(r=>r.text==='Buffering target'));assert.ok(f.state.requests.some(r=>r.texts?.includes('After target')));assert.equal(f.state.seeking,true);
});
