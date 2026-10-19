
(() => {
 const states=new WeakMap();
 const selector='details.panel, details[data-smooth-expand]';
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function contentOf(el){return el.querySelector(':scope > .weather-expanded-content, :scope > [data-disclosure-content]');}
 function stop(state){
  if(state.animation){state.animation.cancel();state.animation=null;}
  if(state.fade){state.fade.cancel();state.fade=null;}
 }
 function clean(el,state){
  el.style.height=state.savedHeight;
  el.style.overflow=state.savedOverflow;
  el.classList.remove('pp-disclosure-animating');
  state.running=false;
  state.settledOpen=el.open;
  state.lastHeight=el.getBoundingClientRect().height;
 }
 function setOpen(el,open,startOverride){
  bind(el);
  const state=states.get(el);
  if(!state.running && el.open===open && state.settledOpen===open)return;
  const start=Number.isFinite(startOverride)?startOverride:el.getBoundingClientRect().height;
  const token=++state.token;
  stop(state);
  if(reduced()||typeof el.animate!=='function'){
   el.open=open;clean(el,state);return;
  }
  state.running=true;state.target=open;
  el.classList.add('pp-disclosure-animating');
  // Measure both complete layouts synchronously, before the browser paints.
  el.style.height=state.savedHeight;
  el.open=open;
  const end=el.getBoundingClientRect().height;
  // Closing keeps the content visible long enough to fade and slide out.
  if(!open)el.open=true;
  el.style.height=start+'px';el.style.overflow='hidden';
  const duration=open?320:260;
  const animation=el.animate([{height:start+'px'},{height:end+'px'}],{
   duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'
  });
  state.animation=animation;
  const content=contentOf(el);
  if(content)state.fade=content.animate(open?[
   {opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}
  ]:[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-3px)'}],{
   duration:open?240:180,easing:'ease-out',fill:'forwards'
  });
  animation.finished.then(()=>{
   if(state.token!==token)return;
   el.open=open;
   stop(state);clean(el,state);
  }).catch(()=>{});
 }
 function bind(el){
  if(!el||!el.matches(selector)||states.has(el))return;
  const summary=el.querySelector(':scope > summary');if(!summary)return;
  const state={running:false,animation:null,fade:null,token:0,target:el.open,
   settledOpen:el.open,lastHeight:el.getBoundingClientRect().height,
   savedHeight:el.style.height,savedOverflow:el.style.overflow};
  states.set(el,state);el.classList.add('pp-smooth-disclosure');
  summary.addEventListener('click',event=>{
   // Do not interfere with any future links/controls inside a summary.
   if(event.target.closest('a,button,input,select,textarea'))return;
   event.preventDefault();setOpen(el,state.running?!state.target:!el.open);
  });
  el.addEventListener('toggle',()=>{
   if(state.running)return;
   // Also animate direct .open assignments made by existing site handlers.
   if(el.open!==state.settledOpen)setOpen(el,el.open,state.lastHeight);
  });
  const observer=new ResizeObserver(()=>{
   if(!state.running){state.lastHeight=el.getBoundingClientRect().height;}
  });
  observer.observe(el);
 }
 function initialize(root=document){
  if(root.matches?.(selector))bind(root);
  root.querySelectorAll?.(selector).forEach(bind);
 }
 // Public helper for future cards; existing weather handlers need not change.
 window.ParkPulseDisclosure={
  setOpen:(el,open)=>setOpen(typeof el==='string'?document.querySelector(el):el,!!open),
  initialize
 };
 document.addEventListener('click',event=>{
  if(event.target.closest?.('.pulse-weather-pill')){
   const panel=document.getElementById('weatherPanel');
   if(panel){const state=states.get(panel);setOpen(panel,true,state&&!state.running?state.lastHeight:undefined);}
  }
 },true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialize());else initialize();
 const added=new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)initialize(node);
 });
 added.observe(document.documentElement,{childList:true,subtree:true});
})();
