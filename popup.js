import {fillAppearance,wireAppearance} from './appearance-ui.js';
import {readSettings,notify,initSelects,message} from './ui-common.js';
initSelects();
const ids=['enabled','provider','target'];
async function load(){const s=await readSettings();fillAppearance(s);for(const id of ids){const el=document.getElementById(id);if(id==='enabled')el.checked=s[id];else el.value=s[id];}}
for(const id of ids)document.getElementById(id).addEventListener('change',async()=>{
 try{
  const s=await readSettings();const el=document.getElementById(id);s[id]=id==='enabled'?el.checked:el.value;
  await chrome.storage.local.set({settings:s});await notify();message('已保存，已更新打开的 YouTube 页面');
 }catch(e){message(e.message,true);}
});
document.getElementById('options').addEventListener('click',()=>chrome.runtime.openOptionsPage());
wireAppearance(()=>message('外观已保存，YouTube 字幕已实时更新'),e=>message(e.message,true));
async function status(){
 const output=document.getElementById('diagnostics');
 try{
  const tabs=await chrome.tabs.query({active:true,currentWindow:true,url:'https://www.youtube.com/*'});
  if(!tabs.length){output.textContent='请切到 YouTube 视频标签页，再打开此弹窗。';return;}
  const r=await chrome.tabs.sendMessage(tabs[0].id,{type:'getStatus'});
  if(!r?.version){output.textContent='请重新加载扩展并刷新 YouTube，启用新版状态检查。';return;}
  output.textContent='页面插件 v'+r.version+' · '+r.mode+'\n字幕 '+r.cueCount+' 句 · 已缓存 '+r.cached+' 句\n接下来 30 秒就绪 '+r.ready+'/'+r.nextCount+' 句 · 预取范围 '+r.seconds+' 秒'+(r.lastLatency?'\n最近当前句请求 '+(r.lastLatency/1000).toFixed(1)+' 秒':'')+(r.prefetchError?'\n预取提示：'+r.prefetchError:'')+(r.lastError?'\n当前句提示：'+r.lastError:'');
 }catch{output.textContent='页面尚未连接，请刷新 YouTube 后重试。';}
}
document.getElementById('statusButton').addEventListener('click',status);
status();
load().catch(e=>message(e.message,true));
