
(() => {
 'use strict';
 const opened=new Map();
 const pillSelector='.pulse-hours-main,.pulse-hours-ee,.pulse-hours-event,.pulse-hours-festival,.score-badge,.park-status-banner,.pulse-closure-main,.pulse-secondary,.pulse-waits-clickable,.pulse-waits-pill-btn,.pulse-weather-pill';
 const escape=value=>escapeHtml(String(value??''));
 function safeUrl(value){try{const u=new URL(String(value));return u.protocol==='https:'?u.href:null;}catch{return null;}}
 function shortClock(value){if(!/^\d{2}:\d{2}$/.test(value||''))return '';const[h,m]=value.split(':').map(Number),hh=h%24;return `${hh%12||12}:${String(m).padStart(2,'0')} ${hh>=12?'PM':'AM'}${h>=24?' (next day)':''}`;}
 function content(entry,park,day){
  const event=entry.event,meta=event._eventMeta;
  const hours=String(event.eventHours||event.hours||(event.open&&event.close?shortClock(event.open)+' – '+shortClock(event.close):'')).replace(/^(?:today|tonight)\s*[·:]?\s*/i,'').trim();
  const admission=meta?.admissionType==='paid_ticket'?'Separate event ticket required.':meta?.admissionType==='complimentary_registration'?'Complimentary for eligible DVC members and registered guests. Registration required.':meta?.admissionType==='park_admission'?'Included with valid EPCOT admission.':'Admission requirements not confirmed.';
  const website=safeUrl(meta?.url)||safeUrl(event.url||event.website||event.ticketUrl)||'https://disneyworld.disney.go.com/park-calendars/day/';
  const official=meta||/^https:\/\/(?:disneyworld|disneyvacationclub)\.disney\.go\.com\//.test(website);
  return '<div class="pp-event-region-inner pp-event-brief"><h4 class="pp-event-heading">'+escape(event.name||'Special event')+'</h4>'+
   '<p class="pp-event-brief-hours">'+escape(hours?hours+' ET':'Specific event hours not supplied.')+'</p>'+
   '<p class="pp-event-brief-admission">'+escape(admission)+'</p>'+
   (meta?.earlyEntry?'<p class="pp-event-brief-entry">Event-ticket entry from '+escape(shortClock(meta.earlyEntry))+' ET.</p>':'')+
   (event._eventHoursDiffer||event._eventMatch==='hours_conflict'?'<p class="pp-event-brief-caution">Event identity or hours need verification—check Disney’s listing.</p>':'')+
   '<div class="pp-event-brief-actions"><a class="pp-event-link" href="'+escape(website)+'" target="_blank" rel="noopener noreferrer"'+(meta?' title="Official details; catalog verified '+escape(meta.verifiedOn)+'"':'')+'>'+escape(official?'Official Disney details ↗':'Event information ↗')+'</a><button type="button" class="pp-event-close pp-card-pill">Hide details</button></div></div>';
 }
 function setExpanded(button,region,key,open,animate=true){
  opened.set(key,open);button.setAttribute('aria-expanded',String(open));region.setAttribute('aria-hidden',String(!open));region.inert=!open;
  const start=region.hidden?0:region.getBoundingClientRect().height;
  if(region._ppAnimation){region._ppAnimation.cancel();region._ppAnimation=null;}
  const finish=()=>{region.hidden=!open;region.style.height='';region.style.overflow='';};
  if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches||typeof region.animate!=='function'){finish();return;}
  region.hidden=false;region.style.height='';const end=open?region.getBoundingClientRect().height:0;region.style.overflow='hidden';
  const animation=region.animate([{height:start+'px',opacity:open?0:1},{height:end+'px',opacity:open?1:0}],{duration:open?320:260,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
  region._ppAnimation=animation;
  animation.finished.then(()=>{if(region._ppAnimation!==animation)return;region._ppAnimation=null;animation.cancel();finish();}).catch(()=>{});
 }
 function bindEntry(card,node,entry,park,day,index){
  const key=card.dataset.parkKey+'|'+day+'|'+entry.kind+'|'+String(entry.event.name||''),id='ppEvent-'+card.dataset.parkKey+'-'+index;
  const button=document.createElement('button');button.type='button';button.className=node.className+' pp-card-pill pp-event-trigger';button.id=id+'-trigger';button.innerHTML=node.innerHTML;
  if(node.matches('.park-status-banner.special-event')){
   const eventHours=String(entry.event.eventHours||entry.event.hours||'').replace(/^(?:today|tonight)\s*[·:]?\s*/i,'').trim();
   button.innerHTML='<span aria-hidden="true">'+escape(entry.event.icon||'✨')+'</span><span><strong>'+escape(entry.event.name||'Special event')+'</strong><small style="display:block;font-size:.7rem;font-weight:400;">'+escape(eventHours?'Scheduled hours: '+eventHours:'Event details')+'</small></span>';
  }
  const cue=document.createElement('span');cue.className='pp-event-chevron';cue.setAttribute('aria-hidden','true');cue.textContent='▾';button.appendChild(cue);
  button.setAttribute('aria-controls',id);button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',(entry.kind==='festival'?'Festival details: ':'Event details: ')+(entry.event.name||'Event'));
  button.title='Show or hide details for '+(entry.event.name||'this event');node.replaceWith(button);
  const region=document.createElement('div');region.id=id;region.className='pp-event-region';region.hidden=true;region.inert=true;region.setAttribute('role','region');region.setAttribute('aria-labelledby',button.id);region.setAttribute('aria-hidden','true');region.innerHTML=content(entry,park,day);
  const hours=card.querySelector('.pulse-hours');const last=[...card.querySelectorAll(':scope > .pp-event-region')].at(-1);
  if(last)last.insertAdjacentElement('afterend',region);else if(hours)hours.insertAdjacentElement('afterend',region);else button.insertAdjacentElement('afterend',region);
  region.addEventListener('click',event=>event.stopPropagation());
  button.addEventListener('click',event=>{event.stopPropagation();setExpanded(button,region,key,button.getAttribute('aria-expanded')!=='true');});
  const close=region.querySelector('.pp-event-close');close.addEventListener('click',event=>{event.stopPropagation();setExpanded(button,region,key,false);button.focus();});
  region.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();setExpanded(button,region,key,false);button.focus();}});
  if(opened.get(key))setExpanded(button,region,key,true,false);
 }
 function enhanceCards(){
  document.querySelectorAll('#parkGrid .park-card').forEach(card=>{
   card.querySelectorAll(pillSelector).forEach(el=>el.classList.add('pp-card-pill'));
   const key=card.dataset.parkKey,park=parkData?.parks?.[key];if(!park)return;
   const day=normalizeHours(park.hours)?.day||curveET(new Date()).day;
   const nowET=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
   const ticketed=getParkScheduledEvent(key,park,nowET),festival=getParkFestival(key,park,nowET);
   const nodes=[];
   if(ticketed){const node=card.querySelector('.pulse-hours-event:not(.pp-event-trigger)')||card.querySelector('.park-status-banner.special-event:not(.pp-event-trigger)');if(node)nodes.push({node,event:ticketed,kind:'ticketed'});}
   if(festival){const node=card.querySelector('.pulse-hours-festival:not(.pp-event-trigger)');if(node)nodes.push({node,event:festival,kind:'festival'});}
   nodes.forEach((entry,index)=>bindEntry(card,entry.node,entry,park,day,index));
  });
 }
 const previousRenderCards=renderCards;
 renderCards=function(...args){const result=previousRenderCards.apply(this,args);if(!isDataUnavailable())enhanceCards();return result;};
 enhanceCards();
})();
