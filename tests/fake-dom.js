export class FakeNode extends EventTarget{
 constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.hidden=false;this.attributes=new Map();this._text='';this.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]||'';},getPropertyPriority(){return '';}};}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this._text='';this.children=[...nodes];}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}hasAttribute(k){return this.attributes.has(k);}removeAttribute(k){this.attributes.delete(k);}
 attachShadow(){this.shadow=new FakeNode('shadow-root');return this.shadow;}remove(){this.removed=true;}
}
export function walk(node,predicate){if(predicate(node))return node;for(const c of [...node.children,...(node.shadow?[node.shadow]:[])]){const result=walk(c,predicate);if(result)return result;}return null;}
export function fakeDocument(){const d=new EventTarget();d.createElement=tag=>new FakeNode(tag);d.createTextNode=text=>{const n=new FakeNode('#text');n.textContent=text;return n;};return d;}
