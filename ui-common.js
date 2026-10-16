import {DEFAULTS,normalize,PROVIDERS,LANGUAGES} from './shared.js';
export async function readSettings(){return normalize((await chrome.storage.local.get('settings')).settings);}
export async function notify(){
 const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});
 await Promise.allSettled(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'refresh'})));
}
export function selectOptions(el,items){
 for(const [value,label]of Object.entries(items)){const option=document.createElement('option');option.value=value;option.textContent=label;el.append(option);}
}
export function initSelects(){
 selectOptions(document.querySelector('#provider'),Object.fromEntries(Object.entries(PROVIDERS).map(([id,p])=>[id,p.name])));
 selectOptions(document.querySelector('#target'),LANGUAGES);
}
export function message(text,error=false){const el=document.querySelector('#message');el.textContent=text;el.classList.toggle('error',error);}
