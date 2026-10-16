(() => {
 function tokens(text){
  if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)].map(s=>({text:s.segment,word:s.isWordLike&&/\p{L}/u.test(s.segment),index:s.index}));
  return [...text.matchAll(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu)].map(m=>({text:m[0],word:/\p{L}/u.test(m[0]),index:m.index}));
 }
 function renderWords(container,text,onWord){
  const nodes=tokens(text).map(part=>{
   if(!part.word)return document.createTextNode(part.text);
   const button=document.createElement('button');button.type='button';button.className='word';button.textContent=part.text;
   button.setAttribute('aria-label','查询 '+part.text);
   button.addEventListener('pointerdown',e=>e.stopPropagation());
   button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();onWord(part.text,text.slice(Math.max(0,part.index-350),part.index+650));});
   return button;
  });container.replaceChildren(...nodes);
 }
 function createPanel(player,lookup){
  const host=document.createElement('div');host.id='yt-bilingual-dictionary';host.hidden=true;
  Object.assign(host.style,{position:'absolute',right:'16px',top:'16px',width:'min(370px, calc(100% - 32px))',maxHeight:'calc(100% - 32px)',zIndex:'90',pointerEvents:'auto'});
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=':host([hidden]){display:none!important}*{box-sizing:border-box}.card{font:15px/1.55 system-ui,sans-serif;color:#edf5ff;background:rgba(13,22,36,.97);border:1px solid #516377;border-radius:14px;padding:18px;box-shadow:0 10px 36px #0008;max-height:min(480px,60vh);overflow:auto;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.header{display:flex;align-items:start;justify-content:space-between;gap:12px}.word-title{font-size:24px;font-weight:750;line-height:1.25}.phonetic{color:#9aafc4;font-size:14px}.translation{font-size:21px;font-weight:650;color:#8cebd1;margin-top:10px}h3{font-size:12px;color:#a4b5c8;font-weight:600;margin:16px 0 4px}p{margin:4px 0}button{font:14px system-ui;color:#d9eafa;background:#2b3d52;border:0;border-radius:7px;padding:5px 10px;cursor:pointer}button:focus-visible{outline:2px solid #8cebd1}.close{font-size:18px}.source{font-size:11px;color:#899db2;margin-top:16px}.error{color:#ffb5a7}.context{font-size:13px;color:#c8d6e4}[hidden]{display:none!important}';
  const card=document.createElement('div');card.className='card';card.setAttribute('role','dialog');card.setAttribute('aria-label','单词翻译与解释');
  const header=document.createElement('div');header.className='header';const title=document.createElement('div');title.className='word-title';
  const closeButton=document.createElement('button');closeButton.className='close';closeButton.type='button';closeButton.textContent='×';closeButton.setAttribute('aria-label','关闭词典');header.append(title,closeButton);
  const body=document.createElement('div');body.setAttribute('aria-live','polite');card.append(header,body);shadow.append(style,card);player.append(host);
  let token=0,currentWord='',currentContext='';
  function close(){token++;host.hidden=true;currentWord='';}
  function para(text,className=''){const n=document.createElement('p');n.className=className;n.textContent=text;body.append(n);}
  function section(label,value,className=''){if(!value)return;const h=document.createElement('h3');h.textContent=label;body.append(h);para(value,className);}
  async function open(word,context,retry=false){
   if(!retry&&!host.hidden&&word===currentWord&&context===currentContext)return;
   const request=++token;currentWord=word;currentContext=context;host.hidden=false;title.textContent=word;body.replaceChildren();para('正在查词…');
   try{
    const result=await lookup(word,context);if(request!==token)return;
    if(result.error)throw new Error(result.error);const entry=result.entry;if(!entry)throw new Error('没有返回词汇解释');
    body.replaceChildren();if(entry.phonetic||entry.partOfSpeech)para([entry.phonetic,entry.partOfSpeech].filter(Boolean).join(' · '),'phonetic');
    para(entry.translation||'暂无译文','translation');section('词义与用法',entry.explanation);section('例句',entry.example);if(entry.exampleTranslation)para(entry.exampleTranslation);
    section('字幕原句',context,'context');if(entry.note)para(entry.note,'phonetic');para(entry.source||'','source');
   }catch(e){
    if(request!==token)return;body.replaceChildren();para('查询失败：'+e.message,'error');
    const retryButton=document.createElement('button');retryButton.type='button';retryButton.textContent='重新查询';retryButton.addEventListener('click',()=>open(word,context,true));body.append(retryButton);
   }
  }
  closeButton.addEventListener('click',close);
  for(const event of ['click','pointerdown','dblclick'])host.addEventListener(event,e=>e.stopPropagation());
  const escape=e=>{if(e.key==='Escape'&&!host.hidden){e.stopPropagation();close();}};
  const outside=e=>{if(!host.hidden&&!e.composedPath().includes(host))close();};
  document.addEventListener('keydown',escape,true);document.addEventListener('pointerdown',outside,true);
  return {open,close,destroy(){close();host.remove();document.removeEventListener('keydown',escape,true);document.removeEventListener('pointerdown',outside,true);}};
 }
 globalThis.YBDictionary=Object.freeze({tokens,renderWords,createPanel});
})();
