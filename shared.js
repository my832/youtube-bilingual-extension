export const PROVIDERS = {
 microsoft: {name:'微软翻译', endpoint:'https://api.cognitive.microsofttranslator.com/translate'},
 google: {name:'谷歌翻译', endpoint:'https://translation.googleapis.com/language/translate/v2'},
 deepseek: {name:'DeepSeek', endpoint:'https://api.deepseek.com/chat/completions', model:'deepseek-flash'},
 mimo: {name:'小米 MiMo', endpoint:'https://api.xiaomimimo.com/v1/chat/completions', model:''},
 custom: {name:'自定义 AI', endpoint:'', model:''}
};
export const LANGUAGES = {'zh-CN':'简体中文','zh-TW':'繁體中文',en:'English',ja:'日本語',ko:'한국어',fr:'Français',de:'Deutsch',es:'Español',pt:'Português',ru:'Русский',ar:'العربية',hi:'हिन्दी',it:'Italiano',vi:'Tiếng Việt',th:'ไทย',id:'Bahasa Indonesia',tr:'Türkçe'};
export const DEFAULTS = {enabled:false, provider:'microsoft', target:'zh-CN',fontSize:24,translationFontSize:21,backgroundOpacity:82,bottom:12,prefetchSeconds:90,profiles:{}};
export function normalize(s={}) {
 return {...DEFAULTS,...s,provider:PROVIDERS[s.provider]?s.provider:DEFAULTS.provider,
 target:LANGUAGES[s.target]?s.target:DEFAULTS.target,
 fontSize:Math.min(48,Math.max(14,Number(s.fontSize)||24)),
 translationFontSize:Math.min(48,Math.max(12,Number(s.translationFontSize)||Math.round((Number(s.fontSize)||24)*.88))),
 backgroundOpacity:Math.min(100,Math.max(0,Number.isFinite(Number(s.backgroundOpacity))?Number(s.backgroundOpacity):82)),
 bottom:Math.min(45,Math.max(5,Number(s.bottom)||12)),prefetchSeconds:Math.min(180,Math.max(30,Number(s.prefetchSeconds)||90)),profiles:s.profiles||{}};
}
export function config(s) {
 const preset=PROVIDERS[s.provider];
 if(!preset) throw new Error('未知翻译服务');
 return {...preset,...s.profiles?.[s.provider],name:preset.name};
}
export function endpointURL(value) {
 let url;
 try {url=new URL(value);} catch {throw new Error('请填写完整的 HTTPS 接口地址');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search) throw new Error('接口必须为 HTTPS，且不能包含账号、查询参数或片段');
 return url;
}
