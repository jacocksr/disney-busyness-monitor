
// Card and weather additions; existing ride, archive, and theme code retained.
const WEATHER_API='https://park-pulse-weather.jacocksr.workers.dev/api/weather';
let weatherData=null,weatherBusy=false,weatherFailed=false,weatherLastAttempt=0;
const wxN=v=>typeof v==='number'&&Number.isFinite(v),wxE=v=>escapeHtml(v);
const wxF=v=>wxN(v)?Math.round(v*9/5+32)+'°F':'Unavailable';
function wxAge(t){const n=Date.parse(t);return Number.isFinite(n)?Math.max(0,(Date.now()-n)/60000):Infinity;}
function wxTime(t,short=false){if(!Number.isFinite(Date.parse(t)))return 'Unavailable';const opts=short?{hour:'numeric',minute:'2-digit',timeZoneName:'short'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'};if(selectedTz!=='local')opts.timeZone=selectedTz;return new Date(t).toLocaleString([],opts);}
function wxIcon(text,night=false){const t=(text||'').toLowerCase();if(/thunder/.test(t))return '⛈️';if(/snow/.test(t))return '🌨️';if(/ice|freezing|sleet/.test(t))return '🧊';if(/rain|shower|drizzle/.test(t))return '🌧️';if(/fog|mist|haze|smoke/.test(t))return '🌫️';if(/mostly cloudy|overcast/.test(t))return '☁️';if(/partly|mostly sunny|few clouds/.test(t))return night?'☁️':'🌤️';if(/cloud/.test(t))return '☁️';if(/clear|sunny|fair/.test(t))return night?'🌙':'☀️';return '🌡️';}
function wxFeel(o){return wxN(o?.heat_index_c)?{v:o.heat_index_c,label:'Heat index'}:wxN(o?.wind_chill_c)?{v:o.wind_chill_c,label:'Wind chill'}:null;}
function pulseCrowd(score,phase){if(phase==='pre-open')return 'Not open yet';if(phase==='early-entry')return 'Early Entry';if(phase==='closed-for-day')return 'Closed for the day';if(!wxN(score))return 'Crowd level unavailable';return score<2?'Very light crowds':score<4?'Light crowds':score<6?'Moderate crowds':score<8?'Busy':'Very busy';}
function renderParkWeather(){document.querySelectorAll('.pulse-weather').forEach(el=>{const p=weatherData?.parks?.[el.dataset.parkKey],o=p?.observation,feel=wxFeel(o);if(!o){el.textContent=weatherFailed?'🌡️ Weather unavailable':'🌡️ Weather loading…';return;}
 const stale=wxAge(o.observed_at)>90||wxAge(weatherData.updated_at)>20||p.collection?.errors?.observations;
 el.innerHTML=wxIcon(o.description)+' '+wxF(o.temperature_c)+(feel?' · Feels '+wxF(feel.v):'')+'<small>'+wxE(stale?'Older/delayed reading · '+wxTime(o.observed_at):'Observed '+wxTime(o.observed_at,true)+' · nearby station')+(weatherFailed?' · refresh delayed':'')+'</small>';
 el.title=(o.description||'Condition unavailable')+' · '+(o.station?.name||'nearby station')+(feel?' · Feels value uses '+feel.label.toLowerCase():'');});}
renderCards=function(){const grid=document.getElementById('parkGrid');grid.innerHTML='';for(const [key,p]of Object.entries(parkData.parks)){
 const phase=getParkPhase(key,p),closed=phase.phase==='pre-open'||phase.phase==='closed-for-day',stats=computeLiveStats(p),groups=closed?{temporary:[],extended:[],special:[]}:getClosureGroups(p),comp=getParkComparison(key,p);
 const avg=closed||stats.avgWait===null?'—':stats.avgWait+' min',longest=closed||!stats.longest?'—':stats.longest.wait_time+' min',ride=closed?'':stats.longest?.name||'';
 const extras=[];if(groups.extended.length)extras.push(groups.extended.length+' refurbishment/extended');if(groups.special.length)extras.push(groups.special.length+' scheduled experience'+(groups.special.length===1?'':'s'));
 const card=document.createElement('div');card.className='park-card '+(key===activeParkKey?'active ':'')+(closed?'closed':'');card.dataset.parkKey=key;card.style.setProperty('--park-color',p.color||'linear-gradient(90deg,var(--gold),var(--pink))');card.onclick=()=>selectPark(key);
 const badge=phase.phase==='closed-for-day'?'<span class="score-badge score-na">N/A</span>':getScoreBadge(p.crowd_score,phase);
 card.innerHTML='<div class="pulse-header"><div class="pulse-identity"><img src="'+wxE(PARK_EMOJI_IMAGES[key]||'')+'" alt=""/><div><h3>'+wxE(p.name)+'</h3><div class="pulse-descriptor">'+wxE(pulseCrowd(p.crowd_score,phase.phase))+'</div></div></div>'+badge+'</div>'
 +getStatusBanner(phase)+'<div class="pulse-waits pulse-waits-clickable" role="button" tabindex="0" onclick="openParkWaitModal(event, \''+key+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openParkWaitModal(event, \''+key+'\');}" title="Tap to view hourly wait trend for '+wxE(p.name)+'"><div><div class="label">Average wait</div><div class="value">'+avg+'</div><div class="pulse-ride" title="'+(comp.status==='ready'?(comp.pctDiff>0?'+':'')+comp.pctDiff+'% vs typical for this time':'No historical baseline')+'">'+(comp.status==='ready'?vsTypicalText(comp.pctDiff):'Typical crowds unknown')+'</div></div><div><div class="label">Longest wait</div><div class="value">'+longest+'</div><div class="pulse-ride" title="'+wxE(ride)+'">'+wxE(ride)+'</div></div><div class="pulse-waits-pill-btn"><span>📈 Tap for hourly wait trend</span><span>›</span></div></div>'
 +(closed?'':'<div class="pulse-closures">'+(groups.temporary.length?'<button type="button" class="pulse-disclosure pulse-closure-main down" data-closure>⚠️ '+groups.temporary.length+' temporary closure'+(groups.temporary.length===1?'':'s')+' ›</button>':'<div class="pulse-closure-main">✓ No temporary closures</div>')+(extras.length?'<button type="button" class="pulse-disclosure" data-closure>'+wxE(extras.join(' · '))+' ›</button>':'')+'</div>')
 +'<div class="pulse-footer"><div class="pulse-weather" data-park-key="'+key+'">🌡️ Weather loading…</div><button type="button" class="pulse-weather-details" aria-label="Weather details for '+wxE(p.name)+'">Details ›</button></div>';
 card.querySelectorAll('[data-closure]').forEach(b=>b.onclick=e=>openClosureModal(e,key));card.querySelector('.pulse-weather-details').onclick=e=>{e.stopPropagation();selectPark(key);document.getElementById('weatherPanel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});};grid.appendChild(card);
 }renderParkWeather();};

// Presentation-only weather view model; provider, payload and fetch code unchanged.
function weatherViewModel(park) {
  const periods = (Array.isArray(park.forecast?.periods) ? park.forecast.periods : [])
    .filter(p => Number.isFinite(Date.parse(p.startTime)) && Date.parse(p.endTime) > Date.now())
    .sort((a,b) => Date.parse(a.startTime)-Date.parse(b.startTime));
  const errors=park.collection?.errors||{}, o=park.observation, f=park.forecast, a=park.alerts;
  const forecastFresh=!!f && !weatherFailed && wxAge(weatherData?.updated_at)<=20 &&
    !errors.forecast && wxAge(f.fetched_at)<=120 && wxAge(f.issued_at)<=360;
  const alertsFresh=!!a && !errors.alerts && wxAge(a.fetched_at)<=15;
  const active=Array.isArray(a?.active)?a.active.filter(x=>!x.expires||Date.parse(x.expires)>Date.now()):[];
  const warnings=[];
  if(weatherFailed||wxAge(weatherData?.updated_at)>20)warnings.push('Weather refresh delayed — last available data.');
  if(o&&(wxAge(o.observed_at)>90||errors.observations))warnings.push('Observation is older or delayed.');
  if(!o)warnings.push('Current observations unavailable.');
  if(f&&!forecastFresh)warnings.push('Forecast may be out of date.');
  if(!alertsFresh)warnings.push('NWS alert checks are unavailable or delayed.');
  return {park,o,f,a,periods,forecastFresh,alertsFresh,active,warnings};
}
function weatherTemp(p,compact=false){
  if(!wxN(p?.temperature))return '—';
  const value=p.temperatureUnit==='C'?p.temperature*9/5+32:p.temperatureUnit==='F'?p.temperature:null;
  return value===null?'—':Math.round(value)+(compact?'°':'°F');
}
function weatherTimeOnly(iso,hourOnly=false){
  if(!Number.isFinite(Date.parse(iso)))return 'Unavailable';
  const options=hourOnly?{hour:'numeric'}:{hour:'numeric',minute:'2-digit'};
  if(selectedTz!=='local')options.timeZone=selectedTz;
  return new Date(iso).toLocaleTimeString([],options);
}
function weatherTrend(view){
  const periods=view.periods.slice(0,6);
  if(!view.forecastFresh||periods.length<3)return null;
  // Avoid interpretations across gaps or sparse probability/temperature data.
  if(periods.some((p,i)=>i&&Date.parse(p.startTime)-Date.parse(periods[i-1].startTime)>90*60000))return null;
  const rain=periods.map(p=>p.probabilityOfPrecipitation?.value);
  const completeRain=rain.every(x=>wxN(x)&&x>=0&&x<=100);
  if(completeRain){
    const early=(rain[0]+rain[1])/2,late=(rain.at(-1)+rain.at(-2))/2,change=late-early;
    const lateStorm=periods.slice(-2).some(p=>/thunder/i.test(p.shortForecast||''));
    if(change>=15&&late>=40)return lateStorm?
      {icon:'⛈️',text:'Rain chances rise; storms are in the forecast'}:
      {icon:'🌧️',text:'Rain chances rise over the next few hours'};
    if(change<=-15&&early>=40)return {icon:'🌤️',text:'Rain chances ease over the next few hours'};
  }
  const temps=periods.map(p=>wxN(p.temperature)?p.temperatureUnit==='C'?p.temperature*9/5+32:p.temperatureUnit==='F'?p.temperature:null:null);
  if(temps.every(wxN)&&temps.at(-1)-temps[0]>=5)return {icon:'🌡️',text:'Temperatures climb over the next few hours'};
  // Stable is shown only for an unchanged forecast description and small swings.
  const descriptions=periods.map(p=>String(p.shortForecast||'').trim().toLowerCase());
  if(completeRain&&temps.every(wxN)&&descriptions[0]&&descriptions.every(x=>x===descriptions[0])&&
     Math.max(...rain)-Math.min(...rain)<=10&&Math.max(...temps)-Math.min(...temps)<=3)
    return {icon:wxIcon(periods[0].shortForecast,periods[0].isDaytime===false),text:'Mostly steady conditions over the next few hours'};
  return null;
}
function renderWeatherGlance(view){
  const {o,periods}=view, feel=wxFeel(o), trend=weatherTrend(view);
  const metadata=[];
  if(feel)metadata.push('Feels '+wxF(feel.v).replace('°F','°'));
  if(wxN(o?.wind_kmh))metadata.push('Wind '+Math.round(o.wind_kmh/1.609344)+' mph');
  if(wxN(o?.humidity_percent))metadata.push('Humidity '+Math.round(o.humidity_percent)+'%');
  let html='<div class="ppwx-current">'+(o?'<span aria-hidden="true">'+wxIcon(o.description)+'</span> '+wxF(o.temperature_c)+' · '+wxE(o.description||'Conditions unavailable'):'Current conditions unavailable')+'</div>';
  if(metadata.length)html+='<div class="ppwx-metadata"'+(feel?' title="Feels value uses '+wxE(feel.label.toLowerCase())+'"':'')+'>'+wxE(metadata.join(' · '))+'</div>';
  if(trend)html+='<div class="ppwx-trend"><span aria-hidden="true">'+trend.icon+'</span> '+wxE(trend.text)+'</div>';
  if(periods.length){
    html+='<div class="ppwx-strip-label">Next hours · rain chance</div><div class="ppwx-glance-forecast" aria-label="Next five hourly forecast periods">'+periods.slice(0,5).map(p=>{
      const rain=p.probabilityOfPrecipitation?.value;
      const description=p.shortForecast||'Forecast description unavailable';
      const accessible=weatherTimeOnly(p.startTime,true)+': '+weatherTemp(p)+', '+description+', '+(wxN(rain)?rain+' percent chance of precipitation':'precipitation probability unavailable');
      return '<div class="ppwx-glance-hour" role="group" aria-label="'+wxE(accessible)+'" title="'+wxE(description+' · '+wxTime(p.startTime))+'"><time datetime="'+wxE(p.startTime)+'" aria-hidden="true">'+wxE(weatherTimeOnly(p.startTime,true))+'</time><strong aria-hidden="true">'+wxIcon(description,p.isDaytime===false)+' '+weatherTemp(p,true)+'</strong><small aria-hidden="true">'+(wxN(rain)?Math.round(rain)+'%':'—')+'</small></div>';
    }).join('')+'</div>';
  }
  html+='<div class="ppwx-glance-source">'+(o?'Observed '+wxE(wxTime(o.observed_at,true))+' · Nearby station':'Observations unavailable')+' · NWS</div>';
  document.getElementById('weatherGlance').innerHTML=html;
  document.getElementById('weatherGlanceWarnings').innerHTML=view.active.map(a=>'<p class="ppwx-alert-preview">⚠️ '+wxE(a.event||'NWS weather alert')+(view.alertsFresh?'':' · Last available report')+' · Expand for details</p>').join('')+
    (view.warnings.length?'<p class="ppwx-warning">'+wxE(view.warnings.join(' '))+'</p>':'');
}

function renderWeatherParkStrip(){
  const strip=document.getElementById('weatherPanelParkStrip');
  const signature=PARK_ORDER.map(key=>key+'|'+(weatherData?.parks?.[key]?.name||parkData.parks?.[key]?.name||key)+'|'+PARK_EMOJI_IMAGES[key]).join(';');
  if(strip.dataset.signature!==signature){
    strip.innerHTML=PARK_ORDER.map(key=>{
      const name=weatherData?.parks?.[key]?.name||parkData.parks?.[key]?.name||key;
      return '<button type="button" class="park-select-btn" data-park-key="'+wxE(key)+'" aria-label="View '+wxE(name)+' weather" aria-pressed="false"><img src="'+wxE(PARK_EMOJI_IMAGES[key]||'')+'" alt="" /></button>';
    }).join('');
    strip.dataset.signature=signature;
  }
  strip.querySelectorAll('button').forEach(button=>{
    const active=button.dataset.parkKey===activeParkKey;
    button.classList.toggle('active-park',active);button.setAttribute('aria-pressed',String(active));
  });
}
function bindWeatherForecastScroll(scroller){
  if(!scroller)return;
  const previous=document.getElementById('weatherForecastPrev'),next=document.getElementById('weatherForecastNext');
  const update=()=>{
    const max=scroller.scrollWidth-scroller.clientWidth;
    previous.disabled=scroller.scrollLeft<=2;
    next.disabled=max<=2||scroller.scrollLeft>=max-2;
  };
  const move=direction=>{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollBy({left:direction*Math.max(150,scroller.clientWidth*.8),behavior:reduced?'auto':'smooth'});
  };
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);
  scroller.addEventListener('scroll',update,{passive:true});
  scroller.addEventListener('keydown',event=>{
    if(event.target!==scroller)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}
    if(event.key==='Home'){event.preventDefault();scroller.scrollTo({left:0,behavior:'auto'});}
    if(event.key==='End'){event.preventDefault();scroller.scrollTo({left:scroller.scrollWidth,behavior:'auto'});}
  });
  requestAnimationFrame(update);
}

function renderWeatherDetails(view){
  const el=document.getElementById('weatherContent'),{o,f,a,active,alertsFresh,periods}=view;
  const opened=new Set([...el.querySelectorAll('details[open]')].map(x=>x.dataset.id));
  const focused=document.activeElement?.closest?.('.weather-alert');
  const focusId=focused&&el.contains(focused)?focused.dataset.id:null;
  const oldScroller=el.querySelector('#weatherForecastScroller');
  const oldKey=oldScroller?.dataset.parkKey;
  const oldLeft=oldScroller?.scrollLeft||0;
  const oldWidth=oldScroller?.clientWidth||0;
  const anchorCard=oldScroller?[...oldScroller.querySelectorAll('[data-period-start]')].find(card=>card.offsetLeft-oldScroller.offsetLeft+card.offsetWidth>oldLeft):null;
  const anchorTime=anchorCard?.dataset.periodStart;
  const wasForecastFocused=document.activeElement?.id==='weatherForecastScroller';
  const forecastButtonFocus=['weatherForecastPrev','weatherForecastNext'].includes(document.activeElement?.id)?document.activeElement.id:null;
  let html='<div class="ppwx-forecast-heading"><div class="ppwx-detail-heading">Hourly forecast <span class="ppwx-forecast-hint">Swipe or use arrows for more hours</span></div>'+(periods.length?'<div class="ppwx-forecast-controls"><button type="button" id="weatherForecastPrev" aria-label="Earlier forecast hours" aria-controls="weatherForecastScroller">‹</button><button type="button" id="weatherForecastNext" aria-label="Later forecast hours" aria-controls="weatherForecastScroller">›</button></div>':'')+'</div>';
  if(periods.length)html+='<div class="weather-hours ppwx-forecast-scroller" id="weatherForecastScroller" data-park-key="'+wxE(activeParkKey)+'" role="region" aria-label="Hourly forecast; use left and right arrow keys to browse" tabindex="0">'+periods.map(p=>'<div class="weather-hour" data-period-start="'+wxE(p.startTime)+'"><time datetime="'+wxE(p.startTime)+'">'+wxE(wxTime(p.startTime,true))+'</time><strong><span aria-hidden="true">'+wxIcon(p.shortForecast,p.isDaytime===false)+'</span> '+weatherTemp(p)+'</strong><div>'+wxE(p.shortForecast||'Forecast unavailable')+'</div><p>'+(wxN(p.probabilityOfPrecipitation?.value)?Math.round(p.probabilityOfPrecipitation.value)+'% rain chance':'Rain probability unavailable')+'</p></div>').join('')+'</div>';
  else html+='<p class="ppwx-provenance">Hourly forecast unavailable.</p>';
  if(alertsFresh&&!active.length)html+='<p class="ppwx-no-alert">✓ No active NWS weather alerts returned</p>';
  else if(!alertsFresh)html+='<p class="ppwx-warning">NWS alert status unavailable or delayed — check official weather information.</p>';
  for(const x of active)html+='<details class="weather-alert" data-id="'+wxE(x.id)+'"'+(opened.has(x.id)?' open':'')+'><summary>⚠️ '+wxE(x.event||'Weather alert')+(alertsFresh?'':' · Last available report')+'</summary><p>'+wxE(x.headline||'')+'</p><p>'+wxE(x.description||'')+'</p>'+(x.instruction?'<p>'+wxE(x.instruction)+'</p>':'')+'<p>Expires '+wxE(wxTime(x.expires))+'</p></details>';
  html+='<div class="ppwx-provenance"><p><strong>Data:</strong> National Weather Service'+(f?' · Forecast issued '+wxE(wxTime(f.issued_at))+' · Retrieved '+wxE(wxTime(f.fetched_at)):' · Forecast unavailable')+'.</p><p>Rain percentages are forecast probabilities, not measured rainfall.'+(a?' · NWS alerts checked '+wxE(wxTime(a.fetched_at))+'.':'')+'</p>';
  if(o){
    const feel=wxFeel(o),stats=[];
    if(feel)stats.push(feel.label+': '+wxF(feel.v));
    if(wxN(o.gust_kmh))stats.push('Gusts '+Math.round(o.gust_kmh/1.609344)+' mph');
    // Preserve the optional observed-rain field already present in the old UI.
    if(wxN(o.precipitation_last_hour_mm))stats.push('Last-hour observed rain '+(o.precipitation_last_hour_mm/25.4).toFixed(2)+' in');
    if(stats.length)html+='<p>'+wxE(stats.join(' · '))+'.</p>';
    html+='<p>Observed '+wxE(wxTime(o.observed_at))+' at '+wxE(o.station?.name||'nearby station')+' ('+wxE(o.station?.id||'unavailable')+')'+(wxN(o.station?.distance_km)?' · '+(o.station.distance_km/1.609344).toFixed(1)+' mi from this park':'')+'.'+(o.fetched_at?' Observation retrieved '+wxE(wxTime(o.fetched_at))+'.':'')+'</p>';
  }
  html+='<p>Nearby station conditions may differ within the park.</p><p>Weather does not confirm attraction closure causes. Not an emergency alert service. <a href="https://www.weather.gov/" target="_blank" rel="noopener" style="color:var(--gold)">Official weather information →</a></p></div>';
  el.innerHTML=html;
  const scroller=el.querySelector('#weatherForecastScroller');
  if(scroller){
    if(oldKey===activeParkKey){
      // Keep the browsed hour when old forecast periods expire or a refresh occurs.
      const anchor=anchorTime?[...scroller.querySelectorAll('[data-period-start]')].find(card=>card.dataset.periodStart===anchorTime):null;
      scroller.scrollLeft=anchor?anchor.offsetLeft-scroller.offsetLeft:oldLeft;
    }
    bindWeatherForecastScroll(scroller);
    if(wasForecastFocused)scroller.focus({preventScroll:true});
    if(forecastButtonFocus)document.getElementById(forecastButtonFocus)?.focus({preventScroll:true});
  }
  if(focusId){const next=[...el.querySelectorAll('.weather-alert')].find(x=>x.dataset.id===focusId);next?.querySelector('summary')?.focus({preventScroll:true});}
}
function renderWeather(){
  renderParkWeather();
  renderWeatherParkStrip();
  const park=weatherData?.parks?.[activeParkKey],name=park?.name||parkData.parks?.[activeParkKey]?.name||'Selected Park';
  document.getElementById('weatherTitle').innerHTML='<img src="'+wxE(PARK_EMOJI_IMAGES[activeParkKey]||'')+'" class="panel-title-emoji" alt=""/>'+wxE(name)+' Weather';
  if(!park){
    const message=weatherFailed?'Weather temporarily unavailable — retrying automatically.':'Loading nearby weather…';
    document.getElementById('weatherGlance').textContent=message;
    document.getElementById('weatherGlanceWarnings').textContent='';
    document.getElementById('weatherContent').innerHTML='<p class="ppwx-provenance">'+wxE(message)+'</p>';return;
  }
  const view=weatherViewModel(park);
  renderWeatherGlance(view);
  renderWeatherDetails(view);
}
function initWeatherDisclosure(){
  const panel=document.getElementById('weatherPanel'),summary=panel.querySelector('.weather-summary');
  const syncState=()=>{
    summary.setAttribute('aria-expanded',String(panel.open));
    panel.querySelector('.weather-expand-label').textContent=panel.open?'Hide details ↑':'Show details ↓';
  };
  panel.addEventListener('toggle',()=>{
    syncState();
    if(panel.open){requestAnimationFrame(()=>{
      const scroller=document.getElementById('weatherForecastScroller');
      if(scroller)scroller.dispatchEvent(new Event('scroll'));
    });}
  });syncState();
  document.getElementById('weatherPanelParkStrip').addEventListener('click',event=>{
    const button=event.target.closest('button[data-park-key]');if(!button)return;
    event.preventDefault();event.stopPropagation();selectPark(button.dataset.parkKey);
  });
  document.addEventListener('click',event=>{
    if(event.target.closest?.('.pulse-weather-pill')){panel.open=true;syncState();}
  },true);
}
async function fetchWeather(){if(weatherBusy||document.hidden)return;weatherBusy=true;weatherLastAttempt=Date.now();const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch(WEATHER_API,{signal:c.signal});if(!r.ok)throw Error('Weather HTTP '+r.status);const d=await r.json();if(d.schema_version!==1||!d.parks||typeof d.parks!=='object'||!Number.isFinite(Date.parse(d.updated_at)))throw Error('Invalid weather response');weatherData=d;weatherFailed=false;}catch(e){weatherFailed=true;console.warn('Weather unavailable',e);}finally{clearTimeout(timer);weatherBusy=false;renderWeather();}}
const pulseOriginalSelectPark=selectPark;selectPark=function(...args){pulseOriginalSelectPark(...args);renderWeather();};const pulseOriginalTimestamp=updateTimestamp;updateTimestamp=function(...args){pulseOriginalTimestamp(...args);renderWeather();};
window.addEventListener('DOMContentLoaded',()=>{initWeatherDisclosure();renderWeather();fetchWeather();setInterval(fetchWeather,300000);});document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderWeather();if(Date.now()-weatherLastAttempt>=300000)fetchWeather();}});
