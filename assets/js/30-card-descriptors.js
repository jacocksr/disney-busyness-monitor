
(()=>{
 function refinePulseCards(){
  document.querySelectorAll('#parkGrid .park-card').forEach(card=>{
   const header=card.querySelector('.pulse-header');
   const descriptor=header?.querySelector('.pulse-descriptor');
   const badge=header?.querySelector('.score-badge');
   if(descriptor&&badge){
    let group=header.querySelector('.pulse-score-group');
    if(!group){group=document.createElement('div');group.className='pulse-score-group';badge.before(group);group.appendChild(badge);}
    group.appendChild(descriptor);
    descriptor.textContent=descriptor.textContent.replace(/ crowds$/i,'');
   }
   const status=card.querySelector('.pulse-closure-main');
   if(status&&!status.classList.contains('down'))status.textContent=status.textContent.replace(/^✓\s*/,'✅ ');
   const secondary=card.querySelector('.pulse-closures .pulse-disclosure:not(.pulse-closure-main)');
   if(secondary){
    secondary.classList.add('pulse-secondary');
    let text=secondary.textContent;
    if(!text.includes('🛠'))text=text.replace(/(\d+ refurbishment\/extended)/,'🛠 $1');
    if(!text.includes('🎟'))text=text.replace(/(\d+ scheduled experiences?)/,'🎟️ $1');
    secondary.textContent=text;
   }
   // One interpretation for both descriptor and insight; no changed score formula.
   const park=parkData.parks[card.dataset.parkKey];
   if(!park)return;
   const phase=getParkPhase(card.dataset.parkKey,park);
   if(phase.phase!=='open')return;
   const score=park.crowd_score;
   const heading=card.querySelector('.pulse-insight strong');
   const detail=card.querySelector('.pulse-insight small');
   if(!heading||!detail)return;
   let title,text;
   if(typeof score!=='number'||!Number.isFinite(score)){title='Check the latest waits';text='Crowd interpretation is unavailable.';}
   else if(score<2){title='A very light park day';text='Compare current waits to make the most of it.';}
   else if(score<4){title='Great time to visit';text='Short waits across most attractions.';}
   else if(score<6){title='Moderate crowds';text='Check headliner waits before your next stop.';}
   else if(score<8){title='A busy park day';text='Compare attractions to find your next opportunity.';}
   else{title='Very busy right now';text='Use current waits to choose your next stop.';}
   heading.textContent=title;detail.textContent=text;
  });
 }
 const previousRenderCards=renderCards;
 renderCards=function(...args){const result=previousRenderCards(...args);refinePulseCards();return result;};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refinePulseCards);
 else refinePulseCards();
})();
