import {normalize} from './shared.js';
import {readSettings} from './ui-common.js';
export const APPEARANCE=['fontSize','translationFontSize','backgroundOpacity','bottom'];
const el=id=>document.getElementById(id);
export function readAppearance(){return Object.fromEntries(APPEARANCE.map(id=>[id,Number(el(id).value)]));}
export function fillAppearance(settings){for(const id of APPEARANCE)el(id).value=settings[id];previewAppearance();}
export function previewAppearance(){
 const a=readAppearance();el('fontValue').textContent=a.fontSize+' px';el('translationFontValue').textContent=a.translationFontSize+' px';el('opacityValue').textContent=a.backgroundOpacity+'%';el('bottomValue').textContent=a.bottom+'%';
 el('previewOriginal').style.setProperty('font-size',a.fontSize+'px','important');el('previewTranslation').style.setProperty('font-size',a.translationFontSize+'px','important');
 for(const id of ['previewOriginal','previewTranslation'])el(id).style.backgroundColor='rgba(10,15,25,'+(a.backgroundOpacity/100)+')';
}
export function wireAppearance(onSaved,onError){
 let pending=null,running=false;
 async function save(){
  if(running)return;running=true;
  try{
   while(pending){
    const appearance=pending;pending=null;
    const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});
    await Promise.allSettled(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'appearancePreview',appearance})));
    const latest=await readSettings();const settings=normalize({...latest,...appearance});
    await chrome.storage.local.set({settings});
   }
   onSaved?.();
  }catch(e){onError?.(e);}finally{running=false;if(pending)save();}
 }
 for(const id of APPEARANCE)el(id).addEventListener('input',()=>{previewAppearance();pending=readAppearance();save();});
}
