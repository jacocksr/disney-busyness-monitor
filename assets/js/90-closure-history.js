
(() => {
 'use strict';
 const KEY_BY_ID={5:'epcot',6:'magic_kingdom',7:'hollywood_studios',8:'animal_kingdom'};
 let payload=null,failed=false,busy=false,lastAttempt=0,selectedPeriod='today',parkModalKey=null;
 const ms=x=>typeof x==='number'?x:Date.parse(x);
 const esc=x=>escapeHtml(String(x??''));
 function et(msValue){return curveET(new Date(msValue));}
 function clock(value){const t=ms(value);if(!Number.isFinite(t))return 'Unknown';const opts={hour:'numeric',minute:'2-digit'};if(selectedTz!=='local')opts.timeZone=selectedTz;return new Date(t).toLocaleTimeString([],opts);}
 function dayStart(day){const [y,m,d]=day.split('-').map(Number);for(const offset of [4,5]){const t=Date.UTC(y,m-1,d,offset);if(et(t).day===day&&et(t).hour===0)return t;}return NaN;}
 function nextDay(day){return new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
 function dayEnd(day){return dayStart(nextDay(day));}
 function hourStart(day,hour){const [y,m,d]=day.split('-').map(Number);for(const offset of [4,5]){const t=Date.UTC(y,m-1,d,hour+offset);const p=et(t);if(p.day===day&&p.hour===hour)return t;}return NaN;}
 function eventEnd(e){return Math.max(ms(e.first_closed_at),ms(e.last_closed_at));}
 function normalize(data){
  if(!data||data.schema_version!==1||!Array.isArray(data.events))throw Error('Unsupported closure payload');
  const events=new Map();
  for(const raw of data.events){
   if(!raw||!KEY_BY_ID[raw.park_id]||!Number.isInteger(raw.ride_id)||!['temporary','unknown','refurbishment'].includes(raw.category)||!['ongoing','completed','interrupted'].includes(raw.state))continue;
   const first=ms(raw.first_closed_at),last=ms(raw.last_closed_at),reopen=ms(raw.first_reopened_at);
   if(!Number.isFinite(first)||!Number.isFinite(last)||last<first||(raw.state==='completed'&&(!Number.isFinite(reopen)||reopen<last)))continue;
   const id=String(raw.event_id||`${raw.park_id}:${raw.ride_id}:${raw.first_closed_at}`);
   events.set(id,{...raw,event_id:id,park:KEY_BY_ID[raw.park_id],ride_name:String(raw.ride_name||'Attraction'),start_uncertain:!!raw.start_uncertain});
  }
  return {...data,events:[...events.values()]};
 }
 function relevant(key,rideId,day,includeUnknown=false){
  if(!payload)return [];
  return payload.events.filter(e=>e.park===key&&(rideId==null||String(e.ride_id)===String(rideId))&&(e.category==='temporary'||includeUnknown&&e.category==='unknown')&&(!day||ms(e.first_closed_at)<dayEnd(day)&&eventEnd(e)>=dayStart(day))).sort((a,b)=>ms(a.first_closed_at)-ms(b.first_closed_at));
 }

 const openRows=new Set();let showGraphClosures=true,showAllRows=false;
 function periodBounds(){
  const today=et(Date.now()).day,shift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7;
  const first=selectedPeriod==='week'?shift(-weekday):selectedPeriod==='seven'?shift(-6):today;
  return {start:dayStart(first),end:Date.now()+1,first,last:today,label:selectedPeriod==='week'?'This week (Mon–today)':selectedPeriod==='seven'?'Last 7 days':'Today'};
 }
 function dateLabel(value){return new Date(ms(value)).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'});}
 function dateTime(value){return dateLabel(value)+' · '+clock(value);}
 function closureDelayed(){return !!payload&&(failed||!Number.isFinite(ms(payload.updated_at))||Date.now()-ms(payload.updated_at)>15*60000);}
 function currentRide(key,id){return (parkData?.parks?.[key]?.rides||[]).find(r=>String(r.id)===String(id));}
 function liveStatus(key,id){
  const park=parkData?.parks?.[key],ride=currentRide(key,id);if(!park||!ride)return {code:'unknown',label:'Current status unavailable'};
  const source=ms(ride.last_updated),stamp=ms(parkData.updated_at),fresh=Number.isFinite(stamp)&&Date.now()-stamp<=STALE_THRESHOLD_MINUTES*60000&&Number.isFinite(source)&&Date.now()-source<=15*60000;
  if(!fresh)return {code:'unknown',label:'Last report only'};
  const phase=getParkPhase(key,park);if(!['open','early-entry'].includes(phase.phase)&&!phase.openNow)return {code:'outside',label:phase.phase==='pre-open'?'Not open yet':'Park not operating'};
  return {code:ride.is_open?'open':'closed',label:ride.is_open?'Reported open':'Reported closed'};
 }
 function description(e,withDate=false){
  const status=liveStatus(e.park,e.ride_id),prefix=withDate?dateLabel(e.first_closed_at)+' · ':'';
  if(e.state==='completed'){
   const n=Math.max(0,Math.round((ms(e.first_reopened_at)-ms(e.first_closed_at))/60000));
   return prefix+(e.start_uncertain?'Reopened '+clock(e.first_reopened_at)+' · start time unknown':(n>0?'Reported closed ~'+n+' min':'Brief closure recorded')+' · '+clock(e.first_closed_at)+'–'+clock(e.first_reopened_at));
  }
  if(e.state==='interrupted')return prefix+'Last reported closed '+clock(e.last_closed_at)+' · observation interrupted';
  if(status.code==='closed'&&!closureDelayed())return prefix+(e.start_uncertain?'Reported closed · start time unknown':'Closed since about '+clock(e.first_closed_at));
  return prefix+'Last reported closed '+clock(e.last_closed_at)+(e.start_uncertain?' · start time unknown':' · reopening not recorded');
 }
 function coverage(day){
  if(!payload)return failed?'Closure history is unavailable. Live wait-time views remain available.':'Closure history is loading.';
  let text='Closure history updated '+dateTime(payload.updated_at)+'. ';
  if(payload.tracking_started_at)text+='Forward tracking began '+dateTime(payload.tracking_started_at)+'. ';
  if(payload.backfill_status!=='completed')text+='Earlier history has not been backfilled. ';
  if(payload.truncated)text+='The loaded event list is truncated. ';
  return text+'Dates use Eastern park days; displayed times follow the time-zone selector. Closures are sampled reports, not exact failure times. Missing observations are unknown, not open. Scheduled experiences and refurbishments stay separate from temporary downtime. Historical scheduled-experience status is not supplied by this endpoint.';
 }
 function showDataInfo(){
  const card=document.getElementById('pcAvailabilityPanel'),info=document.getElementById('pcClosureDataInfo');
  if(card){if(window.ParkPulseDisclosure)ParkPulseDisclosure.setOpen(card,true);else card.open=true;}
  if(info){info.open=true;openRows.add('data-info');setTimeout(()=>{info.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});info.querySelector('summary')?.focus();},340);}
 }
 function currentClosed(){
  const park=parkData?.parks?.[activeParkKey];if(!park)return [];
  return getStandardRides(park).filter(r=>!r.is_open&&!REFURBISHMENT_NAME_PATTERNS.some(p=>p.test(r.name||''))&&liveStatus(activeParkKey,r.id).code==='closed');
 }
 function summaryData(){
  const period=periodBounds(),events=(payload?.events||[]).filter(e=>e.park===activeParkKey&&ms(e.first_closed_at)<period.end&&eventEnd(e)>=period.start);
  const temporary=events.filter(e=>e.category==='temporary'),groups=new Map();
  for(const e of temporary){const key=String(e.ride_id),g=groups.get(key)||{id:key,name:e.ride_name,events:[]};g.events.push(e);groups.set(key,g);}
  const closed=currentClosed();return {period,events,temporary,groups,closed};
 }
 function logicalName(e){return /walt disney world railroad/i.test(e.ride_name)?'Walt Disney World Railroad':e.ride_name;}
 function statusClass(code){return code==='closed'?'is-closed':code==='open'?'is-open':'is-unknown';}
 function bindRemembered(root){
  root.querySelectorAll('details[data-pc-key]').forEach(el=>{el.open=openRows.has(el.dataset.pcKey);el.addEventListener('toggle',()=>{if(el.open)openRows.add(el.dataset.pcKey);else openRows.delete(el.dataset.pcKey);});});
 }
 function openRideHistory(key,id){
  if(document.getElementById('parkWaitModalOverlay')?.classList.contains('active'))closeParkWaitModal();
  if(key!==activeParkKey)selectPark(key);
  openHeatmapRideModal(String(id));
 }
 const closureIconCache=new Map();
 function closureIconFrame(url){
  if(closureIconCache.has(url))return closureIconCache.get(url);
  const work=new Promise(resolve=>{
   const image=new Image();try{if(new URL(url,location.href).origin!==location.origin)image.crossOrigin='anonymous';}catch{resolve(null);return;}
   image.onload=()=>{try{
    const size=256,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,size,size);const pixels=ctx.getImageData(0,0,size,size).data;let left=size,top=size,right=-1,bottom=-1;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(pixels[(y*size+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left||bottom<top){resolve(null);return;}
    const w=right-left+1,h=bottom-top+1,output=document.createElement('canvas');output.width=128;output.height=128;const target=output.getContext('2d'),scale=120/Math.max(w,h),dw=w*scale,dh=h*scale;
    target.drawImage(canvas,left,top,w,h,(128-dw)/2,(128-dh)/2,dw,dh);resolve(output.toDataURL('image/png'));
   }catch{resolve(null);}};
   image.onerror=()=>resolve(null);image.src=url;
  });closureIconCache.set(url,work);return work;
 }
 function normalizeClosureIcons(summary){
  summary.querySelectorAll('.pc-closure-park-strip img').forEach(img=>{const source=img.getAttribute('src');if(!source||img.dataset.pcIconNormalized)return;
   img.dataset.pcIconNormalized='pending';closureIconFrame(new URL(source,location.href).href).then(frame=>{if(frame&&img.isConnected){img.src=frame;img.dataset.pcIconNormalized='true';}else img.dataset.pcIconNormalized='fallback';});
  });
 }
 function closureParkButtons(){
  return PARK_ORDER.map(key=>{const park=parkData?.parks?.[key],name=park?.name||key.replaceAll('_',' ');return '<button type="button" class="park-select-btn'+(key===activeParkKey?' active-park':'')+'" data-park-key="'+esc(key)+'" aria-pressed="'+(key===activeParkKey)+'" aria-label="Show '+esc(name)+' closures" title="'+esc(name)+'"'+(!park?' disabled':'')+'><img src="'+esc(PARK_EMOJI_IMAGES[key]||'')+'" alt=""></button>';}).join('');
 }
 function syncClosureDetails(open){
  const card=document.getElementById('pcAvailabilityPanel'),button=card?.querySelector('.pc-details-pill');if(!button)return;
  const value=typeof open==='boolean'?open:!!card.open;
  button.setAttribute('aria-expanded',String(value));button.setAttribute('aria-label',value?'Hide closure details':'Show closure details');
  button.innerHTML=(value?'Hide details':'Show details')+' <span aria-hidden="true">'+(value?'▴':'▾')+'</span>';
 }
 function bindClosureHeader(summary){
  const card=document.getElementById('pcAvailabilityPanel'),button=summary.querySelector('.pc-details-pill');
  syncClosureDetails();normalizeClosureIcons(summary);
  if(!card.dataset.pcHeaderBound){card.dataset.pcHeaderBound='true';card.addEventListener('toggle',()=>syncClosureDetails());}
  button.onclick=event=>{event.preventDefault();event.stopPropagation();const open=button.getAttribute('aria-expanded')!=='true';syncClosureDetails(open);if(window.ParkPulseDisclosure)ParkPulseDisclosure.setOpen(card,open);else card.open=open;};
  summary.querySelectorAll('.pc-closure-park-strip button').forEach(button=>{
   button.onclick=event=>{event.preventDefault();event.stopPropagation();const key=button.dataset.parkKey;selectPark(key,button);document.querySelector('#pcClosureSummary .pc-closure-park-strip button[data-park-key="'+key+'"]')?.focus({preventScroll:true});};
   button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();const buttons=[...summary.querySelectorAll('.pc-closure-park-strip button:not(:disabled)')],index=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}};
  });
 }
 function renderAvailability(){
  const body=document.getElementById('pcAvailabilityBody'),summary=document.getElementById('pcClosureSummary');if(!body||!summary)return;
  body.querySelectorAll('details[data-pc-key]').forEach(el=>{if(el.open)openRows.add(el.dataset.pcKey);else openRows.delete(el.dataset.pcKey);});
  const d=summaryData(),park=parkData?.parks?.[activeParkKey],phase=park?getParkPhase(activeParkKey,park):null;
  const liveAge=Date.now()-ms(parkData?.updated_at),liveFresh=Number.isFinite(liveAge)&&liveAge<=STALE_THRESHOLD_MINUTES*60000;
  const statusText=!park?'Status unavailable':!liveFresh?'Live status delayed':!['open','early-entry'].includes(phase.phase)&&!phase.openNow?(phase.phase==='pre-open'?'Not open yet':'Park not operating'):d.closed.length+' reported closed now';
  summary.innerHTML='<span class="pc-card-title">Ride closures<small>'+esc(park?.name||'Selected park')+' · '+esc(d.period.label)+'</small></span><span class="pc-collapsed-stats"><span class="pc-count-chip '+(d.closed.length?'is-closed':'')+'">'+esc(statusText)+'</span><span class="pc-count-chip">'+(payload?d.groups.size+' ride'+(d.groups.size===1?'':'s')+' affected':'History '+(failed?'unavailable':'loading'))+'</span><span class="pc-count-chip">'+(payload?d.temporary.length+' recorded interruptions':'Waiting for reports')+'</span></span><button type="button" class="pc-details-pill" aria-controls="pcAvailabilityBody" aria-expanded="false">Show details <span aria-hidden="true">▾</span></button><span class="pc-closure-park-strip" role="group" aria-label="Choose park for closure reports">'+closureParkButtons()+'</span>';
  bindClosureHeader(summary);
  const groups=[...d.groups.values()].sort((a,b)=>(liveStatus(activeParkKey,a.id).code==='closed'?-1:0)-(liveStatus(activeParkKey,b.id).code==='closed'?-1:0)||b.events.length-a.events.length||a.name.localeCompare(b.name));
  const shown=showAllRows?groups:groups.slice(0,8);
  const rangeLabel=dateLabel(d.period.start)+(d.period.first!==d.period.last?'–'+dateLabel(dayStart(d.period.last)):'');
  const partial=payload&&(!payload.tracking_started_at||ms(payload.tracking_started_at)>d.period.start||payload.truncated);
  const other=d.events.filter(e=>e.category!=='temporary'),otherGroups=new Map();
  for(const e of other){const key=e.category+':'+(e.category==='refurbishment'?logicalName(e):e.ride_id),g=otherGroups.get(key)||{name:logicalName(e),category:e.category,events:[]};g.events.push(e);otherGroups.set(key,g);}
  if(park)for(const ride of getStandardRides(park)){
   if(ride.is_open||!REFURBISHMENT_NAME_PATTERNS.some(p=>p.test(ride.name||''))||liveStatus(activeParkKey,ride.id).code!=='closed')continue;
   const name=logicalName({ride_name:ride.name}),key='refurbishment:'+name,g=otherGroups.get(key)||{name,category:'refurbishment',events:[]};
   (g.liveRecords ||= []).push(ride);otherGroups.set(key,g);
  }
  const scheduled=park?getClosureGroups(park).special.filter(e=>!e.is_open):[];
  const timeline=g=>g.events.slice().sort((a,b)=>ms(b.first_closed_at)-ms(a.first_closed_at)).map(e=>'<li>'+esc(description(e,true))+'</li>').join('');
  body.innerHTML='<div class="pc-period-tabs" role="group" aria-label="Closure history period">'+[['today','Today'],['week','This week'],['seven','Last 7 days']].map(([id,label])=>'<button type="button" class="pc-period-tab" data-pc-period="'+id+'" aria-pressed="'+(selectedPeriod===id)+'">'+label+'</button>').join('')+'</div>'+
   '<div class="pc-range-line"><span>'+esc(rangeLabel)+(selectedPeriod==='week'?' · Monday through today':'')+'</span>'+(partial?'<span class="pc-subtle-tag">Partial history</span>':'')+'<button type="button" class="pc-text-action" data-pc-info>About closure data ⓘ</button></div>'+
   (d.closed.length?'<section class="pc-current"><h4>Reported closed now <small>Park feed '+esc(clock(parkData.updated_at))+'</small></h4><div class="pc-current-list">'+d.closed.map(r=>'<button type="button" class="pc-current-ride" data-pc-current="'+esc(r.id)+'"><span>'+esc(r.name)+'</span><span>View ride details →</span></button>').join('')+'</div></section>':'')+
   '<section><h4 class="pc-list-heading">Recorded temporary interruptions</h4>'+
   (!payload?'<p class="pc-empty">'+(failed?'Closure history could not be loaded. Wait-time views are still available.':'Loading closure reports…')+'</p>':!groups.length?'<p class="pc-empty">No temporary interruptions recorded in this period.'+(partial?' Some of this period has not been tracked.':'')+'</p>':
    '<div class="pc-ride-list">'+shown.map(g=>{const st=liveStatus(activeParkKey,g.id),key=activeParkKey+':'+selectedPeriod+':'+g.id;return '<details class="pc-ride-row" data-pc-key="'+esc(key)+'"><summary><span class="pc-ride-name">'+esc(g.name)+'</span><span class="pc-row-count">'+g.events.length+' interruption'+(g.events.length===1?'':'s')+'</span><span class="pc-row-action">View timeline ▾</span></summary><div class="pc-ride-body"><span class="pc-state '+statusClass(st.code)+'">'+esc(st.label)+'</span><ul>'+timeline(g)+'</ul>'+(currentRide(activeParkKey,g.id)?'<button type="button" class="pc-action" data-pc-history="'+esc(g.id)+'">View ride wait history →</button>':'')+'</div></details>';}).join('')+'</div>'+(groups.length>8?'<button type="button" class="pc-action pc-show-all" id="pcShowAll">'+(showAllRows?'Show fewer attractions':'Show all '+groups.length+' attractions')+'</button>':''))+'</section>'+
   (otherGroups.size?'<details class="pc-other" data-pc-key="other:'+activeParkKey+'"><summary>Other reported closures <span>'+[...otherGroups.values()].filter(g=>g.category==='refurbishment').length+' refurbishments · '+[...otherGroups.values()].filter(g=>g.category==='unknown').length+' unknown-start attractions</span> ▾</summary><div>'+[...otherGroups.values()].map(g=>'<details class="pc-other-ride"><summary>'+esc(g.name)+' <span class="pc-subtle-tag">'+(g.category==='refurbishment'?'Refurbishment':'Start unknown')+'</span></summary>'+(g.liveRecords?.length?'<p class="pc-small-note">Reported closed in the current park feed'+(g.liveRecords.length>1?' · '+g.liveRecords.length+' station records grouped':'')+'.</p>':'')+'<ul>'+timeline(g)+'</ul></details>').join('')+'</div></details>':'')+
   (scheduled.length?'<button type="button" class="pc-text-action pc-scheduled" id="pcScheduled">View scheduled / limited-hours experiences ('+scheduled.length+') →</button><small class="pc-small-note">Current snapshot only; not included in temporary ride interruptions.</small>':'')+
   '<details class="pc-data-info" id="pcClosureDataInfo" data-pc-key="data-info"><summary>About closure data ▾</summary><p>'+esc(coverage())+'</p><p>Today is the current Eastern park day. This week starts Monday. Last 7 days includes today and the preceding six Eastern calendar days. A brief or single-sample closure is retained, not shown as zero downtime. Interrupted reports do not establish when a ride reopened.</p></details>';
  body.querySelectorAll('[data-pc-period]').forEach(b=>b.onclick=()=>{selectedPeriod=b.dataset.pcPeriod;showAllRows=false;renderAvailability();});
  body.querySelectorAll('[data-pc-info]').forEach(b=>b.onclick=showDataInfo);
  body.querySelectorAll('[data-pc-history]').forEach(b=>b.onclick=()=>openRideHistory(activeParkKey,b.dataset.pcHistory));
  body.querySelectorAll('[data-pc-current]').forEach(b=>b.onclick=()=>openRideHistory(activeParkKey,b.dataset.pcCurrent));
  const all=body.querySelector('#pcShowAll');if(all)all.onclick=()=>{showAllRows=!showAllRows;renderAvailability();};
  const schedule=body.querySelector('#pcScheduled');if(schedule)schedule.onclick=e=>openClosureModal(e,activeParkKey);
  bindRemembered(body);
 }

 function ensureHeatmapLegend(){
  const table=document.getElementById('heatmapTable'),panel=table?.closest('.panel');if(!panel)return;
  document.querySelectorAll('#heatmapCaveat .pc-heatmap-key').forEach(n=>n.remove());
  if(heatmapMode==='hour'){const caveat=document.getElementById('heatmapCaveat');if(caveat){caveat.textContent='';caveat.classList.remove('visible');}}
  let legend=document.getElementById('pcHeatmapClosureLegend');if(!legend){legend=document.createElement('div');legend.id='pcHeatmapClosureLegend';legend.className='pc-mini-legend';const anchor=panel.querySelector('.heatmap-legend');if(anchor){anchor.classList.add('pc-combined-legend');anchor.appendChild(legend);}else table.parentElement.insertAdjacentElement('afterend',legend);}
  legend.innerHTML=(heatmapMode==='weekday'?'':'<span>▲ Closure recorded</span>')+'<button type="button" class="pc-text-action" data-pc-help>About closure data ⓘ</button>'+
   (failed&&!payload?'<span class="pc-inline-warning">Closure history unavailable</span>':closureDelayed()?'<span class="pc-inline-warning">Closure updates delayed · last report '+esc(clock(payload.updated_at))+'</span>':'');
  legend.querySelector('[data-pc-help]').onclick=showDataInfo;
 }
 function decorateHeatmap(labels){
  ensureHeatmapLegend();if(!payload||!['hour','daily'].includes(heatmapMode))return;
  const today=et(Date.now()).day,days=Array.from({length:7},(_,i)=>new Date(Date.parse(today+'T12:00:00Z')-(6-i)*86400000).toISOString().slice(0,10));
  document.querySelectorAll('#heatmapBody tr[data-ride-id]').forEach(row=>{
   const ride=row.dataset.rideId;row.querySelectorAll('td:not(:first-child)').forEach((cell,i)=>{
    let start,end,interval;
    if(heatmapMode==='hour'){const m=String(labels[i]||'').match(/^(\d{1,2})([ap])$/);if(!m)return;const h=Number(m[1])%12+(m[2]==='p'?12:0);start=hourStart(today,h);end=start+3600000;interval=clock(start)+'–'+clock(end);}
    else{start=dayStart(days[i]);end=dayEnd(days[i]);interval=dateLabel(start);}
    const events=relevant(activeParkKey,ride,null).filter(e=>ms(e.first_closed_at)<end&&eventEnd(e)>=start);if(!events.length)return;
    let node=cell.querySelector('.heatmap-cell');if(!node)return;
    if(node.tagName!=='BUTTON'){const button=document.createElement('button');button.type='button';button.className=node.className+' pc-heatmap-action';button.style.cssText=node.style.cssText;button.innerHTML=node.innerHTML;button.dataset.pcBaseTitle=node.title||'';node.replaceWith(button);node=button;}
    node.querySelectorAll('.pc-heatmap-badge').forEach(n=>n.remove());
    const marker=document.createElement('span');marker.className='pc-heatmap-badge';marker.textContent='▲';marker.setAttribute('aria-hidden','true');node.appendChild(marker);
    const rideName=currentRide(activeParkKey,ride)?.name||events[0].ride_name,value=node.textContent.replace('▲','').trim();
    node.title=(node.dataset.pcBaseTitle?node.dataset.pcBaseTitle+' · ':'')+events.length+' recorded closure'+(events.length===1?'':'s')+' · open ride wait history';
    node.setAttribute('aria-label',rideName+', '+interval+', '+value+' wait value, '+events.length+' recorded closure'+(events.length===1?'':'s')+'. Open ride wait history with closure shading.');
    node.onclick=event=>{event.stopPropagation();openRideHistory(activeParkKey,ride);};
   });
  });
 }
 function noteForChart(chart,key,rideId,day,events){
  const canvas=chart.canvas;if(!canvas?.parentElement)return;let note=document.getElementById(canvas.id+'ClosureNote');
  if(!note){note=document.createElement('div');note.id=canvas.id+'ClosureNote';note.className='pc-chart-note';canvas.parentElement.insertAdjacentElement('afterend',note);}
  const unavailable=payload?.tracking_started_at&&day<et(ms(payload.tracking_started_at)).day;
  const grouped=new Map();for(const e of events){const id=String(e.ride_id),g=grouped.get(id)||{id,name:e.ride_name};grouped.set(id,g);}
  note.innerHTML='<div class="pc-chart-controls">'+(events.length?'<label class="pc-chart-toggle"><input type="checkbox" '+(showGraphClosures?'checked':'')+'> '+(rideId==null?'Show grouped markers':'Show closure shading')+'</label>':'')+'<button type="button" class="pc-text-action" data-pc-info>About closure data ⓘ</button></div>'+
   (rideId==null&&events.length?'<details class="pc-chart-rides"><summary>View affected rides ▾</summary><div>'+[...grouped.values()].map(g=>'<button type="button" class="pc-action" data-pc-ride="'+esc(g.id)+'">'+esc(g.name)+' · wait history →</button>').join('')+'</div></details>':'')+
   (unavailable?'<small>Closure history is not available for this date.</small>':'');
  note.querySelector('[data-pc-info]').onclick=showDataInfo;
  note.querySelectorAll('[data-pc-ride]').forEach(b=>b.onclick=()=>openRideHistory(key,b.dataset.pcRide));
  const toggle=note.querySelector('input');if(toggle)toggle.onchange=()=>{showGraphClosures=toggle.checked;for(const c of [chartInstance,parkWaitTrendModalChartInstance,sparklineInstance,hmSparklineInstance])if(c?.$pc)c.update('none');document.querySelectorAll('.pc-chart-toggle input').forEach(input=>input.checked=showGraphClosures);};
 }
 function chartGroups(info){
  const sorted=info.events.slice().sort((a,b)=>ms(a.first_closed_at)-ms(b.first_closed_at));
  if(info.rideId==null){const groups=new Map();for(const e of sorted){const t=ms(e.first_closed_at),p=et(t),key=p.day+':'+p.hour;let g=groups.get(key);if(!g){g={start:t,end:eventEnd(e),events:[]};groups.set(key,g);}g.events.push(e);g.end=Math.max(g.end,eventEnd(e));}return [...groups.values()];}
  const groups=[];for(const e of sorted){const a=ms(e.first_closed_at),b=eventEnd(e),last=groups.at(-1);if(last&&a<=last.end){last.end=Math.max(last.end,b);last.events.push(e);}else groups.push({start:a,end:b,events:[e]});}return groups;
 }
 const drawingPlugin={
  id:'parkClosureEvents',
  beforeDatasetsDraw(chart){
   chart.$pcHits=[];const info=chart.$pc;if(!showGraphClosures||!info||!chart.chartArea||!chart.scales.x)return;
   const {ctx,chartArea:a}=chart,light=document.documentElement.dataset.theme==='light';ctx.save();ctx.beginPath();ctx.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.clip();
   for(const group of chartGroups(info)){const x=info.pixel(group.start),x2=info.pixel(group.end);if(!Number.isFinite(x)||!Number.isFinite(x2)||x2<a.left||x>a.right)continue;
    const left=Math.max(a.left,x),right=Math.min(a.right,Math.max(x+2,x2)),px=Math.min(a.right-5,Math.max(a.left+5,x));
    if(info.rideId!=null){const uncertain=group.events.every(e=>e.category==='unknown');
     ctx.fillStyle=uncertain?(light?'rgba(160,110,0,.13)':'rgba(255,200,87,.16)'):(light?'rgba(190,30,55,.19)':'rgba(255,65,90,.22)');
     ctx.fillRect(left,a.top,right-left,a.bottom-a.top);
     ctx.strokeStyle=uncertain?(light?'rgba(140,90,0,.55)':'rgba(255,200,87,.65)'):(light?'rgba(165,20,45,.75)':'rgba(255,75,100,.8)');ctx.lineWidth=1;
     ctx.beginPath();ctx.moveTo(left+.5,a.top);ctx.lineTo(left+.5,a.bottom);ctx.stroke();
     if(right-left>3){ctx.beginPath();ctx.moveTo(right-.5,a.top);ctx.lineTo(right-.5,a.bottom);ctx.stroke();}}
    chart.$pcHits.push({left:info.rideId==null?px-9:left,right:info.rideId==null?px+9:Math.max(left+9,right),top:info.rideId==null?a.bottom-17:a.top,bottom:a.bottom,markerX:px,events:group.events});
   }ctx.restore();
  },
  afterDatasetsDraw(chart){
   if(!showGraphClosures||!chart.$pc||chart.$pc.rideId!=null||!chart.chartArea)return;
   const {ctx,chartArea:a}=chart,light=document.documentElement.dataset.theme==='light';ctx.save();
   for(const hit of chart.$pcHits||[]){ctx.fillStyle=light?'#a91e36':'#ff8199';ctx.beginPath();ctx.arc(hit.markerX,a.bottom-5,3,0,Math.PI*2);ctx.fill();}ctx.restore();
  },
  afterEvent(chart,args){
   // Closure overlays never add hover text. Ordinary Chart.js wait-point tooltips are unchanged.
   const p=args.event;if(p?.type!=='click'||!chart.$pc||chart.$pc.rideId!=null)return;
   const hits=(chart.$pcHits||[]).filter(h=>p.x>=h.left&&p.x<=h.right&&p.y>=h.top&&p.y<=h.bottom);
   const rides=[...new Set(hits.flatMap(h=>h.events).map(e=>String(e.ride_id)))];
   if(rides.length===1)openRideHistory(chart.$pc.key,rides[0]);
   else if(rides.length>1){const chooser=document.getElementById(chart.canvas.id+'ClosureNote')?.querySelector('.pc-chart-rides');if(chooser){chooser.open=true;chooser.querySelector('summary')?.focus();}}
  }
 };
 if(typeof Chart!=='undefined'&&typeof Chart.register==='function')Chart.register(drawingPlugin);
 function attachParkChart(chart,key){
  if(!chart||!parkData?.parks?.[key])return;const series=buildParkWaitCurve(parkData.parks[key]),events=relevant(key,null,series.day),hours=series.hours;
  chart.$pc={key,rideId:null,day:series.day,events,pixel:t=>{const p=et(t),parts=new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',minute:'2-digit',second:'2-digit'}).split(':'),fraction=(Number(parts[0])+Number(parts[1]||0)/60)/60;return chart.scales.x.getPixelForValue(p.hour+fraction-(hours[0]||0));}};
  chart.update('none');noteForChart(chart,key,null,series.day,events);
 }
 function rideData(points,events){
  const clean=points.filter(p=>Number.isFinite(ms(p[0]))&&typeof p[1]==='number'&&Number.isFinite(p[1])).map(p=>({x:ms(p[0]),y:p[1]})).sort((a,b)=>a.x-b.x);
  const output=clean.map(p=>({...p}));
  for(const e of events){const a=ms(e.first_closed_at),b=eventEnd(e);for(const p of output)if(p.x>=a&&p.x<=b)p.y=null;output.push({x:a,y:null});if(b>a)output.push({x:b,y:null});}
  for(let i=1;i<clean.length;i++)if(clean[i].x-clean[i-1].x>8*60000)output.push({x:(clean[i].x+clean[i-1].x)/2,y:null});
  return output.sort((a,b)=>a.x-b.x||((a.y===null?-1:0)-(b.y===null?-1:0)));
 }
 function rideContext(kind){const state=dayNavState[kind];if(!state)return null;let key=activeParkKey;for(const[k,p]of Object.entries(parkData?.parks||{}))if((p.rides||[]).some(r=>String(r.id)===state.rideId)){key=k;break;}return {key,id:state.rideId,day:state.selected};}
 function renderRideChart(points,kind){
  const context=rideContext(kind);if(!context)return;
  const canvas=document.getElementById(kind==='ride'?'rideModalSparkline':'hmModalSparkline');if(!canvas||typeof Chart==='undefined')return;
  const ctx=canvas.getContext('2d'),c=chartTheme(),events=relevant(context.key,context.id,context.day,true),data=rideData(points,events);
  const old=kind==='ride'?sparklineInstance:hmSparklineInstance;if(old)old.destroy();
  const gradient=ctx.createLinearGradient(0,0,0,160);gradient.addColorStop(0,c.fillTopSmall);gradient.addColorStop(1,c.fillBottom);
  const first=Math.min(...data.map(p=>p.x)),last=Math.max(...data.map(p=>p.x));
  const chart=new Chart(ctx,{type:'line',data:{datasets:[{label:'Posted wait while open',data,borderColor:c.primary,backgroundColor:gradient,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0,fill:true,spanGaps:false}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{backgroundColor:c.surface,titleColor:c.primary,bodyColor:c.text,borderColor:c.border,borderWidth:1,callbacks:{title:items=>items.length?clock(items[0].parsed.x):'',label:item=>`${item.parsed.y} min`}}},scales:{x:{type:'linear',min:Number.isFinite(first)?first:undefined,max:Number.isFinite(last)&&last>first?last:undefined,grid:{color:'transparent'},ticks:{color:c.textColor,maxTicksLimit:6,callback:v=>clock(Number(v))}},y:{beginAtZero:true,grid:{color:c.grid},ticks:{color:c.textColor,callback:v=>v+'m'}}}}});
  chart.$pc={...context,rideId:context.id,events,pixel:t=>chart.scales.x.getPixelForValue(t)};
  if(kind==='ride')sparklineInstance=chart;else hmSparklineInstance=chart;
  chart.update('none');noteForChart(chart,context.key,context.id,context.day,events);
 }

 function refreshVisible(){
  renderAvailability();if(!isDataUnavailable())renderHeatmap();else ensureHeatmapLegend();
  if(chartInstance)attachParkChart(chartInstance,activeParkKey);
  if(parkWaitTrendModalChartInstance&&parkModalKey)attachParkChart(parkWaitTrendModalChartInstance,parkModalKey);
  for(const kind of ['ride','hm'])if(dayNavState[kind])renderDayNav(kind,dayNavState[kind]);
 }
 async function loadClosureData(force=false){
  if(busy||!force&&Date.now()-lastAttempt<4*60000)return;busy=true;lastAttempt=Date.now();
  try{const response=await fetch(`${API_BASE}/api/closure-events`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Closure endpoint HTTP '+response.status);const next=normalize(await response.json());if(!payload||!Number.isFinite(ms(payload.updated_at))||ms(next.updated_at)>=ms(payload.updated_at))payload=next;failed=false;}
  catch(error){failed=true;console.warn('Closure events unavailable; retaining prior events',error);}finally{busy=false;refreshVisible();}
 }
 renderSparkline=points=>renderRideChart(points,'ride');renderHeatmapModalSparkline=points=>renderRideChart(points,'hm');
 const oldRenderChart=renderChart;renderChart=function(...args){const result=oldRenderChart.apply(this,args);attachParkChart(chartInstance,activeParkKey);return result;};
 const oldOpenPark=openParkWaitModal;openParkWaitModal=function(event,key){parkModalKey=key;const result=oldOpenPark.call(this,event,key);attachParkChart(parkWaitTrendModalChartInstance,key);return result;};
 const oldHeatmapTable=renderHeatmapTable;renderHeatmapTable=function(labels,...args){const result=oldHeatmapTable.call(this,labels,...args);decorateHeatmap(labels);return result;};
 const oldHeatmap=renderHeatmap;renderHeatmap=function(...args){const result=oldHeatmap.apply(this,args);ensureHeatmapLegend();return result;};
 const oldSelect=selectPark;selectPark=function(...args){const result=oldSelect.apply(this,args);showAllRows=false;renderAvailability();return result;};
 const oldCards=renderCards;renderCards=function(...args){const result=oldCards.apply(this,args);renderAvailability();return result;};
 const oldFetch=fetchLatestData;fetchLatestData=async function(...args){try{return await oldFetch.apply(this,args);}finally{await loadClosureData();}};
 const oldDayNav=renderDayNav;renderDayNav=function(kind,state){const result=oldDayNav.call(this,kind,state),points=state.series[state.selected]?.points||[];if(points.length<2){const context=rideContext(kind),canvas=document.getElementById(kind==='ride'?'rideModalSparkline':'hmModalSparkline');if(context&&canvas)noteForChart({canvas},context.key,context.id,context.day,relevant(context.key,context.id,context.day,true));}return result;};
 window.ParkClosureUI={normalize,relevant,rideData,dayStart,dayEnd,hourStart,description,load:loadClosureData,getPayload:()=>payload,periodBounds,chartGroups,refresh:refreshVisible};
 renderAvailability();ensureHeatmapLegend();
})();
