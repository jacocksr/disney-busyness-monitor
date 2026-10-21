/* Park Pulse monthly history, revision 2 — shared ride modal. Load last as a classic script. */
(() => {
 'use strict';
 const doc=document;
 const names={magic_kingdom:'Magic Kingdom',epcot:'EPCOT',hollywood_studios:"Disney’s Hollywood Studios",animal_kingdom:'Disney’s Animal Kingdom'};
 const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const etDay=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
 const monthOf=day=>day.slice(0,7);
 const dateLabel=day=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(day+'T12:00:00Z'));
 const monthLabel=month=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(month+'-01T12:00:00Z'));
 const shiftMonth=(month,delta)=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);};
 const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&m.length===7;
 // Fixed minute bands, shared across every month. Never normalize to a month's maximum.
 const band=v=>!finite(v)?'none':v<15?'short':v<30?'medium':v<45?'long':v<60?'longer':'longest';
 const state={listSort:'avg',listDirection:-1,listFilter:'',view:'today',park:null,month:monthOf(etDay()),ride:'park',payload:null,bounds:null,selectedDay:null,request:0,detailRequest:0,chart:null,lastFocus:null,legacyMode:'daily',busy:false};
 const months=new Map(),days=new Map();
 let root,todayHost,historyHost,legacyBody,oldWrap,primaryToday,primaryHistory,pendingShared=null;
 const base=()=>typeof API_BASE==='string'?API_BASE:'https://wdw-queue-probe.jacocksr.workers.dev';
 const active=()=>typeof activeParkKey==='string'&&names[activeParkKey]?activeParkKey:'magic_kingdom';
 function qualifying(ride){
  if(!ride?.name)return false;
  return (typeof isExcludedRide!=='function'||!isExcludedRide(ride.name))&&(typeof getRideKind!=='function'||getRideKind(ride)==='standard');
 }
 function putLimited(cache,key,value,max){cache.delete(key);cache.set(key,value);while(cache.size>max)cache.delete(cache.keys().next().value);}
 async function getJSON(path){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(base()+path,{signal:controller.signal,headers:{Accept:'application/json'}});
   let body;try{body=await response.json();}catch{throw Error('History returned an unreadable response. Please try again.');}
   if(!response.ok){const e=Error(body.status==='preparing'?'This history is still being prepared. Please try again after the next scheduled update.':body.error==='month_outside_supported_history'?'No recorded history is available for this month.':'History is temporarily unavailable. Please try again.');e.code=body.error||body.status;e.status=response.status;throw e;}
   return body;
  }catch(error){if(error.name==='AbortError')throw Error('The history request timed out. Please try again.');throw error;}
  finally{clearTimeout(timer);}
 }
 async function getMonth(month,force=false){
  if(force)months.delete(month);
  if(months.has(month))return months.get(month);
  const promise=getJSON('/api/history-calendar?month='+encodeURIComponent(month)).then(p=>{
   if(p.schema_version!==1||p.month!==month||!p.rides||!p.parks||!validMonth(p.available_history?.earliest_month)||!validMonth(p.available_history?.latest_month))throw Error('History data did not match the requested month. Please retry.');
   return p;
  });
  putLimited(months,month,promise,6);
  promise.catch(()=>{if(months.get(month)===promise)months.delete(month);});return promise;
 }
 async function getDay(ride,day,force=false){
  const key=ride+'|'+day,entry=days.get(key),ttl=day===etDay()?60000:300000;
  if(!force&&entry&&Date.now()-entry.at<ttl)return entry.promise;
  const promise=getJSON('/api/ride-history-day?ride='+encodeURIComponent(ride)+'&day='+encodeURIComponent(day)).then(p=>{
   if(p.schema_version!==1||String(p.ride)!==String(ride)||p.day!==day||!['available','no_graph'].includes(p.status)||!Array.isArray(p.points)||p.point_timestamp_unit!=='epoch_seconds')throw Error('The graph response did not match the selected attraction and date.');
   if(p.points.some(point=>!Array.isArray(point)||!finite(point[0])||!(point[1]===null||finite(point[1])&&point[1]>=0)))throw Error('The graph contains invalid readings.');
   return p;
  });
  const value={at:Date.now(),promise};putLimited(days,key,value,24);
  promise.catch(()=>{if(days.get(key)===value)days.delete(key);});return promise;
 }
 function legacy(mode){
  if(typeof setHeatmapMode==='function')setHeatmapMode(mode,doc.querySelector('.heatmap-tab[data-mode="'+mode+'"]'));
  window.dispatchEvent(new Event('resize'));
 }
 function switchView(view){
  state.view=view;
  primaryToday.setAttribute('aria-pressed',String(view==='today'));primaryHistory.setAttribute('aria-pressed',String(view==='history'));
  todayHost.hidden=view!=='today';historyHost.hidden=view!=='history';
  root.querySelector('#ppHistoryTitle').textContent=view==='today'?'🎢 Ride Waits Today':'📅 Explore Recorded History';
  if(view==='today'){todayHost.append(oldWrap);legacy('hour');}
  else{legacyBody.append(oldWrap);legacy(state.legacyMode);if(!state.payload&&!state.busy)loadMonth();else renderCalendar();}
 }
 function updateToolbar(){
  root.querySelector('#ppMonthLabel').textContent=monthLabel(state.month);
  root.querySelector('#ppMonthPrevious').disabled=state.busy||!state.bounds||state.month<=state.bounds.earliest_month;
  root.querySelector('#ppMonthNext').disabled=state.busy||!state.bounds||state.month>=state.bounds.latest_month||state.month>=monthOf(etDay());
  root.querySelector('#ppHistoryRefresh').disabled=state.busy;
  root.querySelector('#ppRecentHistory').disabled=state.busy;
 }
 async function loadMonth(force=false,initial=true){
  const token=++state.request,month=state.month;state.busy=true;state.payload=null;updateToolbar();
  root.querySelector('#ppCalendar').setAttribute('aria-busy','true');
  root.querySelector('#ppCalendar').innerHTML='<p class="pp-history-message">Loading '+esc(monthLabel(month))+'…</p>';
  root.querySelector('#ppDayOverview').innerHTML='';
  try{
   let p;
   try{p=await getMonth(month,force);}catch(error){
    // At a month boundary the latest stored month can still be the previous month.
    // Make at most one bounded fallback, never scan backwards through months.
    if(initial&&!state.bounds&&error.code==='month_outside_supported_history'){
     const previous=shiftMonth(month,-1);p=await getMonth(previous,force);if(token!==state.request)return;state.month=previous;
    }else throw error;
   }
   if(token!==state.request)return;
   state.payload=p;state.bounds=p.available_history;
   const mismatch=Object.values(p.rides).filter(r=>r.name&&typeof r.qualifies_for_park_average==='boolean'&&qualifying(r)!==r.qualifies_for_park_average).length;
   root.querySelector('#ppEligibilityWarning').hidden=!mismatch;
   root.querySelector('#ppEligibilityWarning').textContent=mismatch?'Some recorded eligibility flags differ from the current attraction rules. Park averages below use the recorded API denominator; existing live averages are unchanged.':'';
   renderSelector();renderCalendar();
  }catch(error){if(token!==state.request)return;root.querySelector('#ppCalendar').innerHTML='<p class="pp-history-message" role="status">'+esc(error.message)+'</p><button type="button" data-pp-action="retry">Try again</button>';}
  finally{if(token===state.request){state.busy=false;root.querySelector('#ppCalendar').setAttribute('aria-busy','false');updateToolbar();}}
 }
 function renderSelector(){
  const select=root.querySelector('#ppHistoryAttraction');
  const rides=Object.entries(state.payload?.rides||{}).filter(([,r])=>r.park===state.park&&r.qualifies_for_park_average&&qualifying(r)).sort((a,b)=>a[1].name.localeCompare(b[1].name));
  if(state.ride!=='park'&&!rides.some(([id])=>id===state.ride))state.ride='park';
  select.innerHTML='<option value="park">Park average</option>'+rides.map(([id,r])=>'<option value="'+esc(id)+'">'+esc(r.name)+'</option>').join('');select.value=state.ride;
 }
 function selectedDays(){return state.ride==='park'?state.payload?.parks?.[state.park]?.days||{}:state.payload?.rides?.[state.ride]?.days||{};}
 function renderCalendar(){
  updateToolbar();if(!state.payload)return;
  const calendar=root.querySelector('#ppCalendar'),entries=selectedDays(),today=etDay();
  const [year,month]=state.month.split('-').map(Number),first=new Date(Date.UTC(year,month-1,1)).getUTCDay(),count=new Date(Date.UTC(year,month,0)).getUTCDate();
  let html=weekdays.map(w=>'<div class="pp-weekday" aria-hidden="true">'+w+'</div>').join('');
  for(let i=0;i<first;i++)html+='<div class="pp-calendar-blank" aria-hidden="true"></div>';
  for(let day=1;day<=count;day++){
   const date=state.month+'-'+String(day).padStart(2,'0'),value=entries[date],future=date>today,recorded=!future&&finite(value?.avg_wait),isToday=date===today;
   const description=future?'Future — not a forecast':recorded?value.avg_wait+' minute average'+(isToday?', partial day':''):'No recorded positive-wait summary';
   const inner='<time datetime="'+date+'">'+day+'</time><span class="pp-cell-value">'+(future?'Future':recorded?'<span class="pp-cell-number">'+Math.round(value.avg_wait)+'</span><small class="pp-cell-unit">min</small>':'—')+'</span>'+(isToday?'<small class="pp-cell-partial">Today · partial</small>':'');
   const classes='pp-calendar-cell pp-band-'+(recorded?band(value.avg_wait):'none')+(future?' pp-future':'');
   html+=recorded?'<button type="button" class="'+classes+'" data-pp-day="'+date+'" aria-pressed="'+String(state.selectedDay===date)+'" aria-label="'+esc(dateLabel(date)+': '+description)+'">'+inner+'</button>':'<div class="'+classes+'" aria-label="'+esc(dateLabel(date)+': '+description)+'">'+inner+'</div>';
  }
  calendar.innerHTML=html;requestAnimationFrame(fitCalendarNumbers);
  const generated=state.payload.generated_at;
  root.querySelector('#ppHistoryCoverage').textContent=names[state.park]+' · '+(state.ride==='park'?'Equal-weight average of qualifying attraction-day means.':'Positive open-wait readings from completed hourly rollups.')+' Recorded observations do not establish a complete day. Calendar dates use Eastern park time.'+(generated?' Snapshot: '+new Date(generated).toLocaleString()+'.':'');
  if(state.selectedDay&&monthOf(state.selectedDay)===state.month)renderOverview(state.selectedDay,false);else root.querySelector('#ppDayOverview').innerHTML='';
 }
 function liveRide(id,key=state.park){return (parkData?.parks?.[key]?.rides||[]).find(r=>String(r.id)===String(id));}
 function rowsFor(day){
  const filter=state.listFilter.toLowerCase();
  return Object.entries(state.payload?.rides||{}).filter(([id,r])=>r.park===state.park&&r.qualifies_for_park_average&&qualifying(r)&&finite(r.days?.[day]?.avg_wait)&&(!filter||(r.name+' '+(liveRide(id)?.land||'')).toLowerCase().includes(filter))).sort((a,b)=>{
   const left=state.listSort==='avg'?a[1].days[day].avg_wait:state.listSort==='land'?liveRide(a[0])?.land||'':a[1].name;
   const right=state.listSort==='avg'?b[1].days[day].avg_wait:state.listSort==='land'?liveRide(b[0])?.land||'':b[1].name;
   return (typeof left==='number'?left-right:String(left).localeCompare(String(right)))*state.listDirection;
  });
 }
 function renderHistoryRows(day){
  const body=root.querySelector('#ppHistoryRows');if(!body)return;
  body.innerHTML=rowsFor(day).map(([id,r])=>{
   const value=r.days[day],land=liveRide(id)?.land||'',style=getWaitPillStyle(value.avg_wait);
   return '<tr class="ride-row" data-pp-ride="'+esc(id)+'" data-pp-ride-day="'+day+'"><td><button type="button" class="pp-history-ride-name"><strong>'+esc(r.name)+'</strong></button>'+(land?'<span class="queue-mobile-land">'+esc(land)+'</span>':'')+'</td><td class="pp-history-land"><span class="land-tag">'+esc(land)+'</span></td><td style="text-align:right"><span class="wait-pill" style="background:'+style.bg+';color:'+style.color+'" title="'+esc(value.archived_graph_available?'Recorded daily average; archived graph available':'Recorded daily average; detailed graph may be unavailable')+'">'+Number(value.avg_wait.toFixed(1))+' min</span></td></tr>';
  }).join('')||'<tr><td colspan="3" class="pp-empty-rows">No recorded attractions match this filter.</td></tr>';
 }
 function renderOverview(day,focus=true){
  if(state.selectedDay!==day)state.listFilter='';state.selectedDay=day;
  const section=root.querySelector('#ppDayOverview');
  root.querySelectorAll('[data-pp-day]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ppDay===day)));
  if(state.ride!=='park'){section.innerHTML='';if(focus)openGraph(state.ride,day);return;}
  const value=state.payload.parks?.[state.park]?.days?.[day];if(!value){section.innerHTML='';return;}
  section.innerHTML='<div class="pp-history-list-header"><h3 tabindex="-1">'+esc(dateLabel(day))+'</h3><p>'+value.avg_wait.toFixed(1)+' min park average · '+value.ride_count+' qualifying attractions'+(day===etDay()?' · Partial day':'')+'</p><label class="pp-history-filter-label"><span class="pp-sr-only">Filter recorded attractions or lands</span><input id="ppHistoryFilter" type="search" placeholder="🔍 Filter rides or lands…" value="'+esc(state.listFilter)+'"></label></div><div class="pp-history-list-sort"><label for="ppHistorySort">Sort by</label><select id="ppHistorySort"><option value="avg">Average wait</option><option value="name">Attraction</option><option value="land">Land</option></select><button type="button" id="ppHistoryDirection" aria-label="Reverse history sort direction">'+(state.listDirection===1?'Ascending ↑':'Descending ↓')+'</button></div><div class="table-container pp-history-table-container"><table class="pp-history-table"><thead><tr><th>Attraction</th><th class="pp-history-land">Land</th><th style="text-align:right">Daily avg</th></tr></thead><tbody id="ppHistoryRows"></tbody></table></div>';
  section.querySelector('#ppHistorySort').value=state.listSort;
  section.querySelector('#ppHistoryFilter').oninput=e=>{state.listFilter=e.target.value;renderHistoryRows(day);};
  section.querySelector('#ppHistorySort').onchange=e=>{state.listSort=e.target.value;renderHistoryRows(day);};
  section.querySelector('#ppHistoryDirection').onclick=e=>{state.listDirection*=-1;e.currentTarget.textContent=state.listDirection===1?'Ascending ↑':'Descending ↓';renderHistoryRows(day);};
  renderHistoryRows(day);if(focus)section.querySelector('h3').focus({preventScroll:true});
 }
 function fitCalendarNumbers(){
  root.querySelectorAll('.pp-cell-number').forEach(node=>{
   if(!node.clientWidth)return;node.style.fontSize='';let size=parseFloat(getComputedStyle(node).fontSize);
   while(node.scrollWidth>node.clientWidth&&size>9){size-=.5;node.style.fontSize=size+'px';}
  });
 }
 function sharedNote(){
  let note=doc.getElementById('ppSharedHistoryNote');
  if(!note){note=doc.createElement('div');note.id='ppSharedHistoryNote';note.className='hm-modal-note';doc.querySelector('#rideModalOverlay .ride-modal-body').append(note);}
  return note;
 }
 function closeGraph(restore=true){
  if(!dayNavState.ride?._ppHistory)return;
  closeRideModal(restore);
}
 function summaryFor(nav,day){return nav._ppHistory.summaries?.[day];}
 async function fetchSharedDay(nav,day,force=false){
  const meta=nav._ppHistory;if(meta.loading[day]&&!force)return;
  const token=(meta.tokens[day]||0)+1;meta.tokens[day]=token;meta.loading[day]=true;delete meta.errors[day];
  try{
   const result=await getDay(nav.rideId,day,force);
   if(dayNavState.ride!==nav||meta.tokens[day]!==token)return;
   meta.responses[day]=result;
   nav.series[day]={points:result.points.map(p=>[p[0]*1000,p[1]]),partial:!!result.partial};
  }catch(error){if(dayNavState.ride===nav&&meta.tokens[day]===token)meta.errors[day]=error.message;}
  finally{if(dayNavState.ride===nav&&meta.tokens[day]===token){meta.loading[day]=false;if(nav.selected===day)renderDayNav('ride',nav);}}
 }
 function paintSharedState(nav){
  const day=nav.selected,meta=nav._ppHistory,summary=summaryFor(nav,day),response=meta.responses[day],note=sharedNote();
  note.hidden=false;
  const noHistory=doc.getElementById('rideModalNoHistory');
  if(!response&&!meta.errors[day]){
   noHistory.textContent='Loading readings for '+formatDayKey(day,true)+'…';
   if(!meta.loading[day])fetchSharedDay(nav,day);
  }else if(meta.errors[day])noHistory.textContent=meta.errors[day]+' The selected date has not changed.';
  else if(response.status==='no_graph'||!response.points.length)noHistory.textContent=summary?'A daily summary is available, but no detailed graph was returned for this date.':'No detailed readings were returned for this date.';
  else if(response.points.length<2)noHistory.textContent='Only one reading was returned for this date; there is not enough data to draw a line.';
  const points=nav.series[day]?.points||[],positive=points.filter(p=>finite(p[1])&&p[1]>0),numeric=points.filter(p=>finite(p[1]));
  const avg=finite(summary?.avg_wait)?summary.avg_wait:positive.length?positive.reduce((n,p)=>n+p[1],0)/positive.length:null;
  const peak=finite(summary?.peak_wait)?summary.peak_wait:numeric.length?Math.max(...numeric.map(p=>p[1])):null;
  doc.getElementById('rideModalAvgLabel').textContent=formatDayKey(day,false)+' Avg';
  doc.getElementById('rideModalPeakLabel').textContent=formatDayKey(day,false)+' Peak';
  doc.getElementById('rideModalAvg').textContent=avg===null?'–':Number(avg.toFixed(1))+' min';
  doc.getElementById('rideModalPeak').textContent=peak===null?'–':peak+' min';
  // The chart is the existing renderer, including its closure/gap handling. No new Chart is created here.
  note.innerHTML=(meta.context==='weekday'?'<p>Weekday cells combine multiple dates. This chart shows the explicitly selected calendar date, not a weekday-average time series.</p>':'')+'<p>Average: recorded positive waits while open. '+(day===etDay()?'Today is partial. ':'')+'Closure shading uses only loaded closure reports; no shading does not establish an interruption-free day.</p><button type="button" class="pc-text-action" id="ppSharedHistoryRetry">'+(meta.errors[day]?'Retry this date':'Refresh this date')+'</button>';
  note.querySelector('button').onclick=()=>{delete meta.responses[day];nav.series[day]={points:[],partial:day===etDay()};fetchSharedDay(nav,day,true);renderDayNav('ride',nav);};
 }
 function openGraph(ride,day,force=false,context='calendar'){
  if(typeof openRideModal!=='function'||typeof renderDayNav!=='function')return;
  const live=liveRide(ride),recorded=state.payload?.rides?.[ride],park=parkData?.parks?.[state.park];
  const item=live||{id:Number(ride),name:recorded?.name||historicalSummary?.rides?.[ride]?.name||'Attraction history',land:'',is_open:false,wait_time:null};
  const summaries={...(recorded?.days||{})};
  const recent=historicalSummary?.daily_heatmap?.rides?.[ride]||{};
  for(const [key,value]of Object.entries(recent))if(!summaries[key])summaries[key]=value;
  pendingShared={ride:String(ride),day,context,summaries,force,returnFocus:doc.activeElement};
  if(doc.getElementById('hmModalOverlay')?.classList.contains('active'))closeHeatmapRideModal();
  try{openRideModal(item,park?.name||names[state.park]);if(!live)doc.getElementById('rideModalCurrent').textContent='Unavailable';}
  finally{pendingShared=null;}
  const close=doc.querySelector('#rideModalOverlay .ride-modal-close');close?.focus({preventScroll:true});
 }
 function installSharedHistory(){
  const originalInit=initDayNav,originalRebuild=rebuildDayNav,originalRender=renderDayNav,originalClose=closeRideModal;
  initDayNav=function(kind,id){
   if(kind!=='ride'||!pendingShared||String(id)!==pendingShared.ride){if(kind==='ride'){const note=doc.getElementById('ppSharedHistoryNote');if(note)note.hidden=true;}return originalInit.apply(this,arguments);}
   const request=pendingShared,dates=[...new Set([...Object.keys(request.summaries).filter(d=>d<=etDay()),request.day])].sort();
   const nav={rideId:String(id),archived:null,series:{},days:dates,selected:request.day,_ppHistory:{summaries:request.summaries,context:request.context,returnFocus:request.returnFocus,responses:{},errors:{},tokens:{},loading:{}}};
   for(const day of dates)nav.series[day]={points:[],partial:day===etDay()};
   dayNavState.ride=nav;renderDayNav('ride',nav);
  };
  rebuildDayNav=function(kind,nav,reset){if(nav?._ppHistory)return renderDayNav(kind,nav);return originalRebuild.apply(this,arguments);};
  renderDayNav=function(kind,nav){const result=originalRender.apply(this,arguments);if(kind==='ride'&&nav?._ppHistory)paintSharedState(nav);return result;};
  closeRideModal=function(restore=true){
  const nav=dayNavState.ride;
  const result=originalClose.apply(this,arguments);
  const note=doc.getElementById('ppSharedHistoryNote');

  if(note)note.hidden=true;

  if(restore&&nav?._ppHistory?.returnFocus?.isConnected){
    nav._ppHistory.returnFocus.focus({preventScroll:true});
  }

  return result;
  };
 }
 function clock(ms){const options={hour:'numeric',minute:'2-digit',timeZoneName:'short'};if(typeof selectedTz==='string'&&selectedTz!=='local')options.timeZone=selectedTz;return new Intl.DateTimeFormat('en-US',options).format(new Date(ms));}
 function syncPark(){const key=active();if(state.park===key)return;state.park=key;state.ride='park';state.selectedDay=null;closeGraph(false);if(state.payload){renderSelector();renderCalendar();}}
 function init(){
  const panel=doc.querySelector('.heatmap-panel'),tabs=panel?.querySelector('.heatmap-tabs');
  if(!panel||!tabs||doc.getElementById('ppHistoryRoot'))return;
  root=panel;root.id=root.id||'ppHistoryRoot';state.park=active();
  // Reparent the existing table and controls, preserving IDs, listeners, and closure hooks.
  oldWrap=doc.createElement('div');oldWrap.className='pp-existing-heatmap';
  for(const selector of ['#heatmapCaveat','.heatmap-mobile-nav','#heatmapScrollRegion','.heatmap-legend']){const node=panel.querySelector(selector);if(node)oldWrap.append(node);}
  const header=panel.querySelector('.panel-header');const title=doc.getElementById('heatmapTitle');
  // Keep the original title node and its ID available for old renderers.
  title.classList.add('pp-legacy-title');
  const visibleTitle=doc.createElement('h2');visibleTitle.id='ppHistoryTitle';visibleTitle.textContent='🎢 Ride Waits Today';header.insertBefore(visibleTitle,title);tabs.remove();
  const navigation=doc.createElement('div');navigation.className='pp-history-primary';navigation.setAttribute('role','group');navigation.setAttribute('aria-label','Wait history view');
  navigation.innerHTML='<button type="button" id="ppTodayView" aria-pressed="true">Today</button><button type="button" id="ppExploreView" aria-pressed="false">Explore History</button>';header.append(navigation);
  todayHost=doc.createElement('div');todayHost.id='ppTodayHost';todayHost.append(oldWrap);panel.append(todayHost);
  historyHost=doc.createElement('div');historyHost.id='ppHistoryHost';historyHost.hidden=true;
  historyHost.innerHTML='<div class="pp-history-toolbar"><label class="pp-history-select">Explore <select id="ppHistoryAttraction"><option value="park">Park average</option></select></label><div class="pp-history-actions"><button type="button" id="ppRecentHistory">Recent 7 days</button><button type="button" id="ppHistoryRefresh">Refresh history</button></div></div><details id="ppHistoryInfo" class="pp-history-info"><summary aria-label="About recorded history" title="About recorded history"><span class="info-btn" aria-hidden="true">i</span><span class="pp-sr-only">About recorded history</span></summary><div class="pp-history-info-body"><p id="ppHistoryCoverage"></p><p>Colors show absolute average wait minutes, not attendance or busier-than-usual scores. Today is partial; missing summaries are not zero waits. Future dates are not forecasts. The park average weights qualifying attraction-day means equally.</p></div></details><p id="ppEligibilityWarning" class="pp-history-message" hidden></p><div class="pp-month-navigation"><button type="button" id="ppMonthPrevious" aria-label="Previous recorded month">‹</button><h3 id="ppMonthLabel" aria-live="polite"></h3><button type="button" id="ppMonthNext" aria-label="Next recorded month">›</button></div><div id="ppCalendar" class="pp-calendar" aria-label="Recorded daily average wait calendar"></div><div class="pp-history-legend" aria-label="Average wait in minutes"><span class="pp-band-short">Under 15</span><span class="pp-band-medium">15–29</span><span class="pp-band-long">30–44</span><span class="pp-band-longer">45–59</span><span class="pp-band-longest">60+</span><span class="pp-band-none">— No summary</span></div><section id="ppDayOverview" aria-label="Selected date details"></section><details id="ppLegacyPatterns"><summary>Recent daily comparisons &amp; weekday patterns</summary><div id="ppLegacyBody"></div></details>';
  panel.append(historyHost);legacyBody=historyHost.querySelector('#ppLegacyBody');legacyBody.append(tabs);
  // The original Today mode remains accessible through the new primary button.
  const hour=tabs.querySelector('[data-mode="hour"]');if(hour)hour.hidden=true;
  tabs.querySelectorAll('.heatmap-tab').forEach(tab=>{if(tab.dataset.mode==='hour')return;tab.setAttribute('role','button');tab.tabIndex=0;tab.addEventListener('click',()=>{state.legacyMode=tab.dataset.mode;});tab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tab.click();}});});
  historyHost.querySelector('#ppLegacyPatterns').addEventListener('toggle',()=>window.dispatchEvent(new Event('resize')));
  primaryToday=doc.getElementById('ppTodayView');primaryHistory=doc.getElementById('ppExploreView');primaryToday.onclick=()=>switchView('today');primaryHistory.onclick=()=>switchView('history');
  root.querySelector('#ppMonthPrevious').onclick=()=>{if(state.bounds&&state.month>state.bounds.earliest_month){state.month=shiftMonth(state.month,-1);state.selectedDay=null;loadMonth(false,false);}};
  root.querySelector('#ppMonthNext').onclick=()=>{if(state.bounds&&state.month<state.bounds.latest_month){state.month=shiftMonth(state.month,1);state.selectedDay=null;loadMonth(false,false);}};
  root.querySelector('#ppHistoryAttraction').onchange=e=>{state.ride=e.target.value;state.selectedDay=null;renderCalendar();};
  root.querySelector('#ppHistoryRefresh').onclick=()=>loadMonth(true,false);
  root.querySelector('#ppRecentHistory').onclick=()=>{const recent=root.querySelector('#ppLegacyPatterns');recent.open=true;legacyBody.append(oldWrap);state.legacyMode='daily';legacy('daily');recent.scrollIntoView({block:'nearest',behavior:'auto'});};
  root.addEventListener('click',e=>{
   const day=e.target.closest('[data-pp-day]'),ride=e.target.closest('[data-pp-ride]');
   if(day)renderOverview(day.dataset.ppDay);if(ride)openGraph(ride.dataset.ppRide,ride.dataset.ppRideDay);
   if(e.target.closest('[data-pp-action="retry"]'))loadMonth(true,false);
  });
  // The old dated Last 7 Days table must not lose the selected date on a row click.
  const legacyTable=doc.getElementById('heatmapBody');
  legacyTable.addEventListener('click',e=>{
   if(state.view!=='history')return;
   const cell=e.target.closest('td'),row=cell?.closest('tr[data-ride-id]'),id=row?.dataset.rideId;if(!id)return;
   e.preventDefault();e.stopImmediatePropagation();
   if(heatmapMode==='daily'&&cell.cellIndex>0){
    const today=etDay(),date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-6+cell.cellIndex-1);
    openGraph(id,date.toISOString().slice(0,10),false,'daily');
   }else openGraph(id,etDay(),false,heatmapMode==='weekday'?'weekday':'comparison');
  },true);
  installSharedHistory();
  const originalSelect=selectPark;selectPark=function(...args){const result=originalSelect.apply(this,args);syncPark();return result;};
  let previousWidth=0;new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width||0;if(width!==previousWidth){previousWidth=width;requestAnimationFrame(fitCalendarNumbers);}}).observe(root.querySelector('#ppCalendar'));
  doc.fonts?.ready.then(fitCalendarNumbers);
  updateToolbar();
  // No initial history fetch and no history polling timer.
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
})();
