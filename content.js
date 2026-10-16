(() => {
 let settings={enabled:false,fontSize:24,translationFontSize:21,backgroundOpacity:82,bottom:12,prefetchSeconds:90};
 let player,root,original,translated,dictionaryPanel,renderedSource=null;
 let current='',version=0,pending=null,cooldownUntil=0,lastCaptionAt=0,lastError='',prefetchError='',lastLatency=0;
 let lastVideo='',captionState='',lastMediaTime=0,lastVideoNode=null,seeking=false,seekWarm=false,seekTarget=0,seekChangedAt=0,lastMediaWallTime=Date.now();
 let cues=[],track='',sequence=-1,prefetchAfter=0,batchDisabled=false,lastProbe=0,batchSerial=0,initialized=false;
 const session='yb-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const sessionCache=new Map(),liveRequests=new Map(),batches=new Map();
 const call=msg=>chrome.runtime.sendMessage({...msg,session,generation:version});
 const key=text=>version+'|'+text;
 const idNow=()=>new URL(location.href).searchParams.get('v')||location.pathname;
 function reset(){current='';pending=null;lastError='';if(root)root.hidden=true;}
 function advanceWindow(clearCache=false,dropTimeline=false){
  version++;reset();dictionaryPanel?.close();cooldownUntil=0;prefetchAfter=0;prefetchError='';
  if(clearCache){sessionCache.clear();batchDisabled=false;}
  if(dropTimeline){cues=[];track='';sequence=-1;}
  call({type:'setScope'}).catch(()=>{});
 }
 function invalidate(dropTimeline=false){advanceWindow(true,dropTimeline);}
 function remember(text,value){sessionCache.set(text,value);if(sessionCache.size>2400)sessionCache.delete(sessionCache.keys().next().value);}
 function applyAppearance(){
  if(!root)return;
  root.style.bottom=settings.bottom+'%';
  root.style.setProperty('--yb-original-font-size',settings.fontSize+'px');
  root.style.setProperty('--yb-translation-font-size',(settings.translationFontSize||Math.round(settings.fontSize*.88))+'px');
  root.style.setProperty('--yb-bg-alpha',String((settings.backgroundOpacity??82)/100));
 }
 function mount(p) {
  player=p;
  if(root) root.remove();dictionaryPanel?.destroy();renderedSource=null;
  root=document.createElement('div');root.id='yt-bilingual-overlay';root.hidden=true;
  Object.assign(root.style,{position:'absolute',left:'4%',width:'92%',zIndex:'60',pointerEvents:'none',textAlign:'center'});
  const shadow=root.attachShadow({mode:'open'});
  const style=document.createElement('style');
  style.textContent=':host([hidden]){display:none!important}.line{display:table;max-width:100%;margin:3px auto;padding:4px 12px;border-radius:6px;background:rgba(10,15,25,.82);color:#fff;font-family:Arial,sans-serif;font-weight:600;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 1px 2px #000}.translation{color:#8cebd1;font-size:.88em}';
  original=document.createElement('div');original.className='line';
  translated=document.createElement('div');translated.className='line translation';
  style.textContent+='.line{display:block;width:fit-content;background:rgba(10,15,25,var(--yb-bg-alpha,.82));font-size:var(--yb-original-font-size,24px)!important}.translation{font-size:var(--yb-translation-font-size,21px)!important}.word{display:inline;appearance:none;border:0;background:transparent;padding:0;margin:0;font:inherit!important;line-height:inherit;color:inherit;text-shadow:inherit;white-space:inherit;cursor:pointer;pointer-events:auto}.word:hover,.word:focus-visible{text-decoration:underline;text-decoration-color:#8cebd1;outline:none}';
  shadow.append(style,original,translated);p.append(root);
  dictionaryPanel=YBDictionary.createPanel(p,(word,context)=>call({type:'lookupWord',word,context}));
 }
 function show(source,target) {
  if(!root)return;
  applyAppearance();
  if(renderedSource!==source){
   renderedSource=source;
   if(source===current&&source)YBDictionary.renderWords(original,source,(word,context)=>dictionaryPanel.open(word,context));else original.textContent=source;
  }
  translated.textContent=target;root.hidden=!source||!settings.enabled;
 }
 function caption() {
  return [...(player?.querySelectorAll('.ytp-caption-window-container .caption-visual-line')||[])].map(el=>el.textContent.trim()).filter(Boolean).join('\n');
 }
 function toggleNativeHide(hide) {
  // Hide visually, but leave the native caption DOM available for reading.
  const container=player?.querySelector('.ytp-caption-window-container');
  if(!container)return;
  if(hide) {
   if(!container.hasAttribute('data-yb-opacity')) container.setAttribute('data-yb-opacity',JSON.stringify([container.style.getPropertyValue('opacity'),container.style.getPropertyPriority('opacity')]));
   container.style.setProperty('opacity','0','important');
  } else if(container.hasAttribute('data-yb-opacity')) {
   const [v,p]=JSON.parse(container.getAttribute('data-yb-opacity'));container.style.setProperty('opacity',v,p);container.removeAttribute('data-yb-opacity');
  }
 }
 function drain(){
  if(!pending||!settings.enabled||(seeking&&!seekWarm)||Date.now()<cooldownUntil)return;
  const job=pending,k=key(job.text);
  if(sessionCache.has(job.text)||liveRequests.has(k)){pending=null;return;}
  if([...liveRequests.values()].filter(j=>j.version===version).length>=2)return;
  pending=null;liveRequests.set(k,job);
  call({type:'translate',text:job.text}).then(response=>{
   if(response.error)throw new Error(response.error);
   if(job.version===version){remember(job.text,response.text);lastLatency=response.elapsedMs||0;lastError='';if(current===job.text)show(current,response.text);}
  }).catch(e=>{
   if(job.version===version){lastError=e.message;cooldownUntil=Date.now()+5000;if(current===job.text){show(current,'翻译失败：'+lastError);pending=job;}}
  }).finally(()=>{liveRequests.delete(k);drain();});
 }
 function prefetch(time,rate){
  if(!cues.length||(seeking&&!seekWarm)||!settings.enabled||Date.now()<prefetchAfter||Date.now()<cooldownUntil)return;
  const active=[...batches.values()].filter(b=>b.version===version);
  const inBatch=text=>active.some(b=>b.texts.includes(text));
  const seconds=Math.min(180,(settings.prefetchSeconds||90)*(rate||1));
  let remaining=YBSubtitle.upcoming(cues,time,seconds,80,16000)
   .filter(text=>!sessionCache.has(text)&&!liveRequests.has(key(text))&&!inBatch(text)&&text!==current);
  let available=2-active.length;
  while(available-->0&&remaining.length){
   const near=!active.some(b=>b.near),count=batchDisabled?1:(near?2:6);
   const texts=[];let chars=0;
   while(remaining.length&&texts.length<count&&chars+remaining[0].length<=4000){const text=remaining.shift();texts.push(text);chars+=text.length;}
   if(!texts.length)break;
   const epoch=version,id=epoch+'|'+(++batchSerial),job={version:epoch,texts,near};batches.set(id,job);active.push(job);
   const msg=batchDisabled?{type:'translate',text:texts[0],prefetch:true}:{type:'translateBatch',texts,near};
   call(msg).then(response=>{
    if(response.error)throw new Error(response.error);
    const values=response.texts||[response.text];
    if(values.length!==texts.length||values.some(t=>typeof t!=='string'))throw new Error('批量译文格式不正确');
    if(epoch===version){texts.forEach((text,i)=>remember(text,values[i]));prefetchError='';if(sessionCache.has(current))show(current,sessionCache.get(current));}
   }).catch(e=>{
    if(epoch===version){prefetchError=e.message;prefetchAfter=Date.now()+3000;if(/格式|数量/.test(e.message))batchDisabled=true;}
   }).finally(()=>{batches.delete(id);});
  }
 }
 function mediaSeeking(){
  const target=lastVideoNode?.currentTime||0;
  if(!seeking){seeking=true;seekWarm=false;seekTarget=target;seekChangedAt=Date.now();advanceWindow();}
  else if(Math.abs(target-seekTarget)>.1){if(seekWarm)advanceWindow();seekWarm=false;seekTarget=target;seekChangedAt=Date.now();}
 }
 function mediaSeeked(){seeking=false;seekWarm=false;lastMediaTime=lastVideoNode?.currentTime||0;lastMediaWallTime=Date.now();update();}
 function update(){
  const p=document.querySelector('#movie_player'),id=idNow();
  if(p!==player){toggleNativeHide(false);reset();if(p)mount(p);else{root?.remove();dictionaryPanel?.destroy();player=null;}}
  if(id!==lastVideo){lastVideo=id;invalidate(true);captionState='';lastProbe=0;}
  if(!player)return;
  if(!settings.enabled){toggleNativeHide(false);if(root)root.hidden=true;dictionaryPanel?.close();return;}
  if(Date.now()-lastProbe>1500){lastProbe=Date.now();window.postMessage({source:'yb-caption-control',enabled:true},location.origin);}
  const video=player.querySelector('video');
  if(video!==lastVideoNode){
   lastVideoNode?.removeEventListener?.('seeking',mediaSeeking);lastVideoNode?.removeEventListener?.('seeked',mediaSeeked);
   lastVideoNode=video;video?.addEventListener?.('seeking',mediaSeeking);video?.addEventListener?.('seeked',mediaSeeked);
   lastMediaTime=video?.currentTime||0;lastMediaWallTime=Date.now();reset();
  }
  if(video?.seeking){
   mediaSeeking();lastMediaTime=video.currentTime;lastMediaWallTime=Date.now();
   // Start preparing the settled target while YouTube is still buffering the seek.
   if(cues.length&&Date.now()-seekChangedAt>=250){
    seekWarm=true;const text=YBSubtitle.cueAt(cues,lastMediaTime)?.text||'';
    if(text!==current){current=text;pending=null;if(text){show(text,sessionCache.get(text)||'正在准备跳转位置的译文…');if(!sessionCache.has(text))pending={text,version};}}
    drain();prefetch(lastMediaTime,video.playbackRate);
   }
   return;
  }
  if(seeking){seeking=false;seekWarm=false;}
  const elapsed=Math.max(0,(Date.now()-lastMediaWallTime)/1000),expected=video?.paused?0:elapsed*(video?.playbackRate||1);
  if(video&&(video.currentTime-lastMediaTime < -1 || video.currentTime-lastMediaTime>Math.max(1.8,expected+1)))advanceWindow();
  lastMediaTime=video?.currentTime||0;lastMediaWallTime=Date.now();
  if(video?.ended||player.classList?.contains('ad-showing')){reset();toggleNativeHide(false);dictionaryPanel?.close();return;}
  const state=player.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed');
  if(state!==captionState){if(captionState==='true')advanceWindow();captionState=state;reset();}
  if(state!=='true'){toggleNativeHide(false);show('双语字幕已开启','请先点击 YouTube 播放器的 CC 按钮，并选择原文字幕语言');return;}
  const text=cues.length?(YBSubtitle.cueAt(cues,lastMediaTime)?.text||''):caption();
  if(!text){reset();toggleNativeHide(false);if(!cues.length&&Date.now()-lastCaptionAt>15000)show('等待 YouTube 字幕','若视频没有字幕，暂时无法翻译');prefetch(lastMediaTime,video?.playbackRate);return;}
  lastCaptionAt=Date.now();toggleNativeHide(true);
  if(text!==current){
   current=text;pending=null;
   if(sessionCache.has(text))show(text,sessionCache.get(text));
   else{show(text,lastError?'翻译失败：'+lastError:'正在翻译…');pending={text,version};}
  }
  drain();prefetch(lastMediaTime,video?.playbackRate);
 }
 window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==window||event.origin!==location.origin||data?.source!=='yb-caption-bridge'||data.videoId!==idNow()||!settings.enabled||typeof data.track!=='string')return;
  if(data.kind==='track'){if(data.track!==track){invalidate(true);track=data.track;}return;}
  if(data.kind!=='cues'||!Array.isArray(data.cues)||data.cues.length>20000||!Number.isInteger(data.sequence))return;
  if(data.track===track&&sequence===data.sequence)return;
  if(data.track!==track){invalidate(true);track=data.track;}
  cues=YBSubtitle.normalize(data.cues.filter(c=>c&&typeof c.text==='string'&&c.text.length<=4000&&Number.isFinite(c.start)&&Number.isFinite(c.end)));
  sequence=data.sequence;reset();update();
 });
 async function refresh(){
  try{
   const r=await call({type:'getSettings'}),next=r.settings||settings;
   const changed=!initialized||['provider','target','enabled','translationRevision'].some(k=>settings[k]!==next[k]);
   settings=next;initialized=true;if(changed)invalidate();applyAppearance();
   window.postMessage({source:'yb-caption-control',enabled:settings.enabled},location.origin);update();
  }catch{settings.enabled=false;toggleNativeHide(false);root?.remove();dictionaryPanel?.destroy();}
 }
 chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender?.id&&sender.id!==chrome.runtime.id)return;
  if(msg.type==='refresh')refresh();
  if(msg.type==='appearancePreview'){
   const a=msg.appearance||{};
   settings={...settings,fontSize:Math.min(48,Math.max(14,Number(a.fontSize)||settings.fontSize)),translationFontSize:Math.min(48,Math.max(12,Number(a.translationFontSize)||settings.translationFontSize||21)),backgroundOpacity:Math.min(100,Math.max(0,Number.isFinite(Number(a.backgroundOpacity))?Number(a.backgroundOpacity):settings.backgroundOpacity??82)),bottom:Math.min(45,Math.max(5,Number(a.bottom)||settings.bottom))};
   applyAppearance();reply?.({ok:true});
  }
  if(msg.type==='getStatus'){
   const next=YBSubtitle.upcoming(cues,lastMediaTime,30,30,12000);
   reply?.({version:'1.2.0',mode:cues.length?'轨道预翻译':'实时逐句翻译',cueCount:cues.length,cached:sessionCache.size,ready:next.filter(t=>sessionCache.has(t)).length,nextCount:next.length,seconds:settings.prefetchSeconds||90,lastLatency,prefetchError,lastError});
  }
 });
 const interval=setInterval(()=>{try{update();}catch{clearInterval(interval);toggleNativeHide(false);root?.remove();dictionaryPanel?.destroy();}},100);
 document.addEventListener('yt-navigate-start',()=>{invalidate(true);});
 refresh();
})();
