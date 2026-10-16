// Shared pure timeline functions; no extension privileges or page credentials.
(() => {
 function normalize(cues) {
  const sorted=cues.filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&typeof c.text==='string'&&c.text.trim())
   .map(c=>({start:Math.max(0,c.start),end:c.end,text:c.text.replace(/\s+/g,' ').trim().slice(0,4000)}))
   .sort((a,b)=>a.start-b.start).slice(0,20000);
  const result=[];
  for(const c of sorted) {
   const prev=result.at(-1);
   if(prev&&prev.start===c.start){prev.text+=' '+c.text;prev.end=Math.max(prev.end,c.end);}
   else result.push(c);
  }
  for(let i=0;i<result.length-1;i++)result[i].end=Math.min(result[i].end,result[i+1].start);
  return result;
 }
 function parseJSON3(data) {
  const cues=[];
  for(const e of data?.events||[]) {
   const text=(e.segs||[]).map(s=>typeof s.utf8==='string'?s.utf8:'').join('');
   if(!text.trim()||!Number.isFinite(e.tStartMs))continue;
   const start=e.tStartMs/1000,end=start+(Number(e.dDurationMs)||3000)/1000;
   const prev=cues.at(-1);
   if(e.aAppend&&prev&&start<=prev.end){prev.text+=' '+text;prev.end=Math.max(prev.end,end);}
   else cues.push({start,end,text});
  }
  return normalize(cues);
 }
 function indexAt(cues,time) {
  let lo=0,hi=cues.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].start<=time)lo=mid+1;else hi=mid;}
  return lo-1;
 }
 function cueAt(cues,time) {const i=indexAt(cues,time);return i>=0&&time<cues[i].end?cues[i]:null;}
 function upcoming(cues,time,seconds=30,maxItems=12,maxChars=4000) {
  const result=[];let total=0;
  for(let i=Math.max(0,indexAt(cues,time));i<cues.length;i++) {
   const c=cues[i];if(c.start>time+seconds)break;if(c.end<=time)continue;
   if(result.length>=maxItems||total+c.text.length>maxChars)break;
   if(!result.includes(c.text)){result.push(c.text);total+=c.text.length;}
  }
  return result;
 }
 globalThis.YBSubtitle=Object.freeze({normalize,parseJSON3,cueAt,upcoming});
})();
