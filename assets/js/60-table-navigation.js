
// Frontend-only table navigation, using existing data and event handlers.
(() => {
 function init(){
  const region=document.getElementById('heatmapScrollRegion');
  const prev=document.getElementById('heatmapScrollPrev'),next=document.getElementById('heatmapScrollNext');
  const update=()=>{
    const max=region.scrollWidth-region.clientWidth;
    prev.disabled=region.scrollLeft<=2;next.disabled=max<=2||region.scrollLeft>=max-2;
    document.getElementById('heatmapSwipeHint').textContent=max>2?'Swipe to compare columns':'All columns visible';
  };
  const move=direction=>region.scrollBy({left:direction*Math.max(48,region.clientWidth-144),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  prev.onclick=()=>move(-1);next.onclick=()=>move(1);
  region.addEventListener('scroll',update,{passive:true});
  region.addEventListener('keydown',event=>{
   if(event.target!==region)return;
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}
   if(event.key==='Home'){event.preventDefault();region.scrollTo({left:0,behavior:'auto'});}
   if(event.key==='End'){event.preventDefault();region.scrollTo({left:region.scrollWidth,behavior:'auto'});}
  });
  new MutationObserver(()=>requestAnimationFrame(update)).observe(document.getElementById('heatmapTable'),{childList:true,subtree:true});
  new ResizeObserver(update).observe(region);update();
  // Add keyboard access to sortable headers without replacing sort behavior.
  const enhance=()=>document.querySelectorAll('#ridesTable th.sortable,#heatmapTable th.sortable').forEach(th=>{
    th.tabIndex=0;
    if(!th.dataset.keyboardSort){th.dataset.keyboardSort='true';th.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();th.click();}});}
  });
  enhance();new MutationObserver(enhance).observe(document.getElementById('heatmapHead'),{childList:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
