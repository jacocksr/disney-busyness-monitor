
(() => {
 const validWait=ride=>ride.is_open&&typeof ride.wait_time==='number'&&Number.isFinite(ride.wait_time)&&ride.wait_time>0;
 const qualifying=park=>getStandardRides(park).filter(validWait);
 computeLiveStats=function(park){
  const rides=qualifying(park);
  if(!rides.length)return {avgWait:null,longest:null};
  const mean=rides.reduce((sum,ride)=>sum+ride.wait_time,0)/rides.length;
  const longest=rides.reduce((best,ride)=>!best||ride.wait_time>best.wait_time?ride:best,null);
  return {avgWait:Math.round(mean),longest};
 };
 getParkBaseline=function(park){
  if(!historicalSummary?.rides)return null;
  const key=getCurrentBucketKey(),pairs=[];
  for(const ride of qualifying(park)){
   const b=historicalSummary.rides[String(ride.id)]?.buckets?.[key];
   if(b&&typeof b.avg_wait==='number'&&Number.isFinite(b.avg_wait)&&b.avg_wait>0&&
      typeof b.samples==='number'&&Number.isFinite(b.samples)&&b.samples>0)
    pairs.push({current:ride.wait_time,historical:b.avg_wait,samples:b.samples});
  }
  if(!pairs.length)return null;
  return {avgWait:pairs.reduce((n,p)=>n+p.historical,0)/pairs.length,
   currentAvg:pairs.reduce((n,p)=>n+p.current,0)/pairs.length,
   samples:pairs.reduce((n,p)=>n+p.samples,0),matchedRides:pairs.length,
   eligibleRides:qualifying(park).length};
 };
 getParkComparison=function(key,park){
  if(getParkPhase(key,park).phase!=='open')return {status:'closed'};
  if(!qualifying(park).length)return {status:'no-data'};
  const b=getParkBaseline(park),min=historicalSummary?.min_samples_for_reliable||MIN_SAMPLES_FOR_RELIABLE;
  if(!b||b.samples<min)return {status:'insufficient-data'};
  return {status:'ready',pctDiff:Math.round((b.currentAvg-b.avgWait)/b.avgWait*100),
   matchedRides:b.matchedRides,eligibleRides:b.eligibleRides};
 };
 function shortenLabels(){
  document.querySelectorAll('#parkGrid .park-card').forEach(card=>{
   const park=parkData.parks[card.dataset.parkKey];if(!park)return;
   const closuresContainer=card.querySelector('.pulse-closures');
   if(closuresContainer){
    closuresContainer.querySelectorAll('.pulse-secondary').forEach(b=>b.remove());
    const groups=getClosureGroups(park);
    if(groups.extended.length){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='pulse-disclosure pulse-secondary';
      btn.setAttribute('data-closure','');
      const count=groups.extended.length;
      btn.title=count+' refurbishment/long-term closure'+(count===1?'':'s')+' — open for exact classifications';
      btn.setAttribute('aria-label',btn.title);
      btn.onclick=e=>openClosureModal(e,card.dataset.parkKey);
      const label=document.createElement('span');
      label.className='pulse-pill-label';
      label.textContent='🛠 '+count+' refurbishment'+(count===1?'':'s')+' ›';
      btn.appendChild(label);
      closuresContainer.appendChild(btn);
    }
    if(groups.special.length){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='pulse-disclosure pulse-secondary';
      btn.setAttribute('data-closure','');
      const count=groups.special.length;
      btn.title=count+' scheduled events/shows — open for exact classifications';
      btn.setAttribute('aria-label',btn.title);
      btn.onclick=e=>openClosureModal(e,card.dataset.parkKey);
      const label=document.createElement('span');
      label.className='pulse-pill-label';
      label.textContent='🎟️ '+count+' scheduled events/shows ›';
      btn.appendChild(label);
      closuresContainer.appendChild(btn);
    }
   }
   const phase=getParkPhase(card.dataset.parkKey,park);
   if(phase.phase==='open'&&!qualifying(park).length){
    const heading=card.querySelector('.pulse-insight strong'),detail=card.querySelector('.pulse-insight small');
    if(heading)heading.textContent='No positive waits reported';
    if(detail)detail.textContent='Check individual attractions; zero readings are excluded from averages.';
   }
   const comp=getParkComparison(card.dataset.parkKey,park);
   // Explain differing coverage if only some eligible rides have a baseline.
   if(comp.status==='ready'){
    const comparison=card.querySelector('.pulse-waits>div:first-child .pulse-ride');
    if(comparison)comparison.title='Positive waits only. Compared '+comp.matchedRides+' of '+comp.eligibleRides+' qualifying attractions with matching weekday/hour history; each attraction weighted equally.';
   }
  });
 }
 const previousCards=renderCards;
 renderCards=function(...args){const result=previousCards(...args);shortenLabels();return result;};
 const refresh=()=>{renderCards();renderBestParkBanner();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
})();
