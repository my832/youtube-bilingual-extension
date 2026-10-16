export function cancelled(){const e=new Error('任务已取消');e.name='AbortError';return e;}
export function createScheduler(max=4,maxBackground=2){
 let active=0,backgroundActive=0;const queue=[];
 function pump(){
  while(active<max){
   const index=queue.findIndex(item=>!item.background||backgroundActive<maxBackground);
   if(index<0)return;
   const item=queue.splice(index,1)[0];item.signal?.removeEventListener('abort',item.abort);
   if(item.signal?.aborted){item.reject(cancelled());continue;}
   active++;if(item.background)backgroundActive++;
   Promise.resolve().then(()=>{if(item.signal?.aborted)throw cancelled();return item.job();})
    .then(item.resolve,item.reject).finally(()=>{active--;if(item.background)backgroundActive--;pump();});
  }
 }
 return {schedule(job,{signal,priority=0,background=false}={}){
  if(signal?.aborted)return Promise.reject(cancelled());
  if(queue.length>=24)return Promise.reject(new Error('翻译繁忙，请稍后重试'));
  return new Promise((resolve,reject)=>{
   const item={job,signal,priority,background,resolve,reject};
   item.abort=()=>{const i=queue.indexOf(item);if(i>=0){queue.splice(i,1);reject(cancelled());}};
   signal?.addEventListener('abort',item.abort,{once:true});queue.push(item);queue.sort((a,b)=>a.priority-b.priority);pump();
  });
 },stats:()=>({active,backgroundActive,queued:queue.length})};
}
