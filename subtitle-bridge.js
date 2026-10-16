// MAIN-world adapter: only reads YouTube caption responses. API keys never enter this world.
(() => {
 const nativeFetch=window.fetch, xhrOpen=XMLHttpRequest.prototype.open, xhrSend=XMLHttpRequest.prototype.send;
 const requests=new WeakMap();
 let enabled=false,activeVideo='',activeTrack='',generation=0,loading=false,lastAttempt=0,lastProbe=0,cached=null,sequence=0;
 const videoId=()=>new URL(location.href).searchParams.get('v')||'';
 const trackKey=url=>[url.searchParams.get('lang')||'',url.searchParams.get('kind')||'',url.searchParams.get('tlang')||''].join('|');
 function captionURL(value) {
  try {const u=new URL(value,location.href);return u.protocol==='https:'&&u.hostname==='www.youtube.com'&&u.pathname==='/api/timedtext'?u:null;}catch{return null;}
 }
 function post(kind,extra={}) {window.postMessage({source:'yb-caption-bridge',kind,videoId:activeVideo,track:activeTrack,...extra},location.origin);}
 function select(id,key) {
  if(id!==activeVideo||key!==activeTrack){activeVideo=id;activeTrack=key;generation++;cached=null;loading=false;lastAttempt=0;if(enabled)post('track');}
 }
 function parse(text) {
  try {return YBSubtitle.parseJSON3(JSON.parse(text));}catch{}
  try {
   const xml=new DOMParser().parseFromString(text,'application/xml');
   if(xml.querySelector('parsererror'))return [];
   return YBSubtitle.normalize([...xml.querySelectorAll('p[t],text[start]')].map(el=>{
    const srv=el.tagName==='p',scale=srv?1000:1;
    const start=Number(el.getAttribute(srv?'t':'start'))/scale;
    const duration=Number(el.getAttribute(srv?'d':'dur'))/scale;
    return {start,end:start+(duration||3),text:el.textContent};
   }));
  }catch{return [];}
 }
 function accept(url,text,gen) {
  if(gen!==generation||videoId()!==activeVideo||trackKey(url)!==activeTrack||text.length>5000000)return;
  const cues=parse(text);if(!cues.length)return;
  cached=cues;sequence++;if(enabled)post('cues',{cues,sequence});
 }
 function observe(value) {
  const url=captionURL(value);
  if(!url||url.searchParams.get('v')!==videoId())return null;
  // Native requests are authoritative when the viewer switches the caption language.
  select(videoId(),trackKey(url));return {url,generation};
 }
 window.fetch=function(...args) {
  let request=null;try{request=observe(typeof args[0]==='string'||args[0] instanceof URL?String(args[0]):args[0]?.url);}catch{}
  const promise=nativeFetch.apply(this,args);
  if(request)promise.then(res=>{if(res.ok)res.clone().text().then(text=>accept(request.url,text,request.generation)).catch(()=>{});}).catch(()=>{});
  return promise;
 };
 XMLHttpRequest.prototype.open=function(method,url,...rest) {requests.set(this,{url});return xhrOpen.call(this,method,url,...rest);};
 XMLHttpRequest.prototype.send=function(...args) {
  const request=observe(requests.get(this)?.url);
  if(request)this.addEventListener('load',()=>{try{
   if(this.status===200){const text=this.responseType==='json'?JSON.stringify(this.response):this.responseText;accept(request.url,text,request.generation);}
  }catch{}},{once:true});
  return xhrSend.apply(this,args);
 };
 async function probe() {
  if(!enabled||Date.now()-lastProbe<1000)return;lastProbe=Date.now();
  const id=videoId();if(!id)return;
  if(id!==activeVideo)select(id,'');
  if(cached){post('cues',{cues:cached,sequence});}
  const p=document.querySelector('#movie_player');
  try {
   const selected=p?.getOption?.('captions','track');
   const response=p?.getPlayerResponse?.();
   if(!selected?.languageCode||response?.videoDetails?.videoId!==id)return;
   const tracks=response?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
   const track=tracks.find(t=>selected.vssId?t.vssId===selected.vssId:t.languageCode===selected.languageCode&&(t.kind||'')===(selected.kind||''));
   const url=captionURL(track?.baseUrl);if(!url)return;
   if(selected.translationLanguage?.languageCode)url.searchParams.set('tlang',selected.translationLanguage.languageCode);
   select(id,trackKey(url));
   if(cached){post('cues',{cues:cached,sequence});return;}
   if(loading||Date.now()-lastAttempt<20000)return;
   loading=true;lastAttempt=Date.now();const gen=generation;
   // Preserve signed parameters and the original response format; XML and JSON3 are both parsed.
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try {
    const res=await nativeFetch.call(window,url.href,{credentials:'same-origin',signal:controller.signal});
    if(res.ok)accept(url,await res.text(),gen);
   }catch{}finally{clearTimeout(timer);if(gen===generation)loading=false;}
  }catch{}
 }
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.source!=='yb-caption-control')return;
  enabled=event.data.enabled===true;
  if(!enabled)return;
  if(cached&&activeVideo===videoId())post('cues',{cues:cached,sequence});
  probe();
 });
})();
