import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookupWord,parseAIEntry,validateLookup,dictionaryDetails} from '../dictionary.js';
import {normalize} from '../shared.js';
const settings=provider=>normalize({provider,profiles:{[provider]:{key:'secret',model:'test-model'}}});
test('AI lookup uses contextual dictionary prompt and preserves separate user data',async()=>{
 let body;
 const entry=await lookupWord(settings('deepseek'),'bright','She has a bright future.',{fetcher:async(url,options)=>{
  body=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({translation:'光明的',explanation:'此处形容前途很好',example:'A bright future.',exampleTranslation:'光明的未来。'})}}]});
 }});
 assert.equal(entry.translation,'光明的');assert.equal(body.thinking.type,'disabled');assert.deepEqual(JSON.parse(body.messages[1].content),{word:'bright',context:'She has a bright future.'});assert.match(body.messages[0].content,/dictionary/);
});
test('traditional translator combines dictionary definition with word translation',async()=>{
 const texts=[];
 const entry=await lookupWord(settings('microsoft'),'hello','Hello there.',{translateText:async text=>{texts.push(text);return '译文：'+text;},fetcher:async(url,options)=>{
  assert.equal(url,'https://api.dictionaryapi.dev/api/v2/entries/en/hello');assert.equal(options.credentials,'omit');return Response.json([{phonetic:'/həˈləʊ/',meanings:[{partOfSpeech:'interjection',definitions:[{definition:'Used as a greeting.',example:'Hello, Sam.'}]}]}]);
 }});
 assert.equal(entry.phonetic,'/həˈləʊ/');assert.match(entry.explanation,/Used as a greeting/);assert.equal(texts[0],'hello');assert.match(entry.exampleTranslation,/译文/);
});
test('dictionary network failure still returns word translation with an honest note',async()=>{
 const entry=await lookupWord(settings('google'),'inventedword','A context.',{translateText:async()=> '词语译文',fetcher:async()=>new Response('',{status:404})});
 assert.equal(entry.translation,'词语译文');assert.equal(entry.explanation,'');assert.match(entry.note,/未收录/);
});
test('lookup rejects arbitrary paragraphs and incomplete AI explanations',()=>{
 assert.throws(()=>validateLookup('two words','context'),/单词/);assert.throws(()=>validateLookup('hello','x'.repeat(1001)),/长度/);
 assert.throws(()=>parseAIEntry({choices:[{message:{content:'{"translation":"译文"}'}}]},'hello'),/完整/);
 assert.equal(dictionaryDetails({}).explanation,'');
});
