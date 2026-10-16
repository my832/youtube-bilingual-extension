import {fillAppearance,wireAppearance,readAppearance} from './appearance-ui.js';
import {PROVIDERS,config,endpointURL,normalize} from './shared.js';
import {readSettings,notify,initSelects,message} from './ui-common.js';
initSelects();
const el=id=>document.getElementById(id);
let draft,selected;
function capture(){
 if(!selected)return;
 draft.profiles[selected]={key:el('key').value.trim(),endpoint:el('endpoint').value.trim(),model:el('model').value.trim(),region:el('region').value.trim()};
}
function renderProvider(){
 selected=el('provider').value;draft.provider=selected;const c=config(draft);
 for(const id of ['key','endpoint','model','region'])el(id).value=c[id]||'';
 el('regionRow').hidden=selected!=='microsoft';el('modelRow').hidden=['microsoft','google'].includes(selected);
 el('providerHelp').textContent={microsoft:'使用 Azure Translator 正式 API。请开通资源并填写 Key；区域型资源同时填写区域。',google:'使用 Google Cloud Translation Basic v2 正式 API，需启用 API 并配置有效的 API Key。',deepseek:'使用 DeepSeek Chat Completions 接口。默认模型来自官方文档，若账号不可用请更换模型 ID。',mimo:'使用小米 MiMo Chat Completions 接口，采用 api-key 鉴权。请填写账号当前可用的文本模型 ID。',custom:'支持 OpenAI Chat Completions 兼容协议，采用 Authorization: Bearer 鉴权。仅支持 HTTPS 接口。'}[selected];
}
el('provider').addEventListener('change',()=>{capture();renderProvider();message('编辑中的配置尚未保存');});
wireAppearance(()=>message('显示设置已自动保存。服务配置仍需点击保存设置。'),e=>message(e.message,true));
el('form').addEventListener('submit',async event=>{
 event.preventDefault();el('save').disabled=true;
 try{
  capture();draft.provider=selected;const c=config(draft),url=endpointURL(c.endpoint);
  if(!c.key)throw new Error('请填写 API Key');
  if(!['microsoft','google'].includes(selected)&&!c.model)throw new Error('请填写模型 ID');
  // Request only the chosen origin, directly in response to the Save click.
  if(!await chrome.permissions.request({origins:[url.origin+'/*']}))throw new Error('未获得接口域名权限，设置未保存');
  const latest=await readSettings();
  draft=normalize({...latest,provider:selected,profiles:{...latest.profiles,...draft.profiles},enabled:el('enabled').checked,target:el('target').value,...readAppearance(),prefetchSeconds:Number(el('prefetchSeconds').value)});
  await chrome.storage.local.set({settings:draft});await notify();message('已保存。打开 YouTube 视频并开启 CC 即可使用。');
 }catch(e){message(e.message,true);}finally{el('save').disabled=false;}
});
el('test').addEventListener('click',async()=>{
 el('test').disabled=true;message('正在测试已保存的配置…');
 try{
  const r=await chrome.runtime.sendMessage({type:'test',text:'Hello, welcome to YouTube.'});
  if(r.error)throw new Error(r.error);message('连接成功，译文：'+r.text);
 }catch(e){message(e.message,true);}finally{el('test').disabled=false;}
});
el('clear').addEventListener('click',async()=>{
 await chrome.runtime.sendMessage({type:'clearCache'});await notify();message('已清除当前翻译缓存');
});
async function init(){draft=await readSettings();el('provider').value=draft.provider;el('target').value=draft.target;el('enabled').checked=draft.enabled;fillAppearance(draft);el('prefetchSeconds').value=String(draft.prefetchSeconds);renderProvider();}
init().catch(e=>message(e.message,true));
