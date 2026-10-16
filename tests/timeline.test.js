import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../subtitle-core.js';
const {parseJSON3,cueAt,upcoming,normalize}=globalThis.YBSubtitle;
test('JSON3 combines word segments and clamps overlapping auto captions',()=>{
 const cues=parseJSON3({events:[{tStartMs:0,dDurationMs:5000,segs:[{utf8:'Hello '},{utf8:'world'}]},{tStartMs:2000,dDurationMs:2000,segs:[{utf8:'Next'}]},{tStartMs:4000,segs:[{utf8:'\n'}]}]});
 assert.deepEqual(cues,[{start:0,end:2,text:'Hello world'},{start:2,end:4,text:'Next'}]);
 assert.equal(cueAt(cues,1.9).text,'Hello world');assert.equal(cueAt(cues,2).text,'Next');assert.equal(cueAt(cues,4),null);
});
test('append events form one stable phrase',()=>{
 const cues=parseJSON3({events:[{tStartMs:0,dDurationMs:3000,segs:[{utf8:'Hello'}]},{aAppend:1,tStartMs:1000,dDurationMs:2000,segs:[{utf8:'world'}]}]});
 assert.equal(cues.length,1);assert.equal(cues[0].text,'Hello world');
});
test('lookahead follows seeks and bounds both horizon and payload size',()=>{
 const cues=normalize(Array.from({length:100},(_,i)=>({start:i*2,end:i*2+2,text:'Line '+i})));
 assert.equal(upcoming(cues,80,10)[0],'Line 40');assert.equal(upcoming(cues,80,10).at(-1),'Line 45');assert.equal(upcoming(cues,0,60).length,12);
 assert.equal(upcoming(normalize([{start:0,end:1,text:'a'.repeat(3000)},{start:1,end:2,text:'b'.repeat(2000)}]),0).length,1);
});
