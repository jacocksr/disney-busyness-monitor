
(() => {
 'use strict';
 // Maintained official-calendar metadata. Add exact dates here when new seasons are verified.
 // This catalog enriches an existing schedule entry; it never creates a ticketed event from a month alone.
 const VERIFIED_ON='2026-10-15';
 const dates=(year,month,days)=>days.map(day=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
 const dvcUrl='https://disneyvacationclub.disney.go.com/discounts-perks-offers/member-events/moonlight-magic/';
 const records=[
  {id:'mnsshp-2026',park:'magic_kingdom',kind:'event',name:'Mickey’s Not-So-Scary Halloween Party',icon:'🎃',pattern:/not.so.scary|halloween party/i,
   dates:[...dates(2026,8,[7,11,14,18,21,23,25,28,30]),...dates(2026,9,[1,4,8,11,13,15,18,20,22,24,25,27,29]),...dates(2026,10,[1,2,4,6,8,9,13,15,16,18,22,23,25,27,29,31])],
   expectedOpen:'19:00',expectedClose:'24:00',earlyEntry:'16:00',category:'Paid-ticket event',admissionType:'paid_ticket',
   admission:'A separate, date-specific party ticket is required. Consult the official event page for current ticket options.',
   summary:'A Halloween celebration with trick-or-treating, themed entertainment, character experiences and select attractions.',
   highlights:['Mickey’s Boo-To-You Halloween Parade','Disney’s Not-So-Spooky Spectacular','Hocus Pocus Villain Spelltacular','Trick-or-treat locations throughout the park'],
   url:'https://disneyworld.disney.go.com/events-tours/magic-kingdom/mickeys-not-so-scary-halloween-party/'},
  {id:'mvmcp-2026',park:'magic_kingdom',kind:'event',name:'Mickey’s Very Merry Christmas Party',icon:'🎄',pattern:/very merry|christmas party/i,
   dates:[...dates(2026,11,[8,9,12,13,15,17,19,20,24,25,27,29]),...dates(2026,12,[1,3,4,6,8,10,11,13,15,17,18,20,22])],
   expectedOpen:'19:00',expectedClose:'24:00',earlyEntry:'16:00',category:'Paid-ticket event',admissionType:'paid_ticket',
   admission:'A separate, date-specific party ticket is required. Consult the official event page for current ticket options.',
   summary:'A Christmas celebration with holiday entertainment, select attractions, cookies and festive beverages at designated locations.',
   highlights:['Mickey’s Once Upon a Christmastime Parade','Minnie’s Wonderful Christmastime Fireworks','Mickey’s Most Merriest Celebration','Cookies and festive beverages at designated locations'],
   url:'https://disneyworld.disney.go.com/events-tours/magic-kingdom/mickeys-very-merry-christmas-party/'},
  {id:'jollywood-2026-2027',park:'hollywood_studios',kind:'event',name:'Disney Jollywood Nights',icon:'✨',pattern:/jollywood/i,
   dates:[...dates(2026,11,[7,14,16,21,23,28]),...dates(2026,12,[5,7,12,14,19,21,23]),...dates(2027,1,[3,5])],
   expectedOpen:'19:30',expectedClose:'24:30',earlyEntry:'17:30',category:'Paid-ticket event',admissionType:'paid_ticket',
   admission:'A separate, date-specific event ticket is required. Consult the official event page for current ticket options.',
   summary:'A Hollywood-inspired holiday evening with event entertainment, character experiences, photo opportunities and select attractions.',
   highlights:['Disney Holidays in Hollywood','What’s This? Tim Burton’s The Nightmare Before Christmas Sing-Along','Jingle Bell, Jingle BAM!','Event Disney PhotoPass digital downloads included with the event ticket'],
   url:'https://disneyworld.disney.go.com/events-tours/hollywood-studios/jollywood-nights/'},
  {id:'moonlight-epcot-2026',park:'epcot',kind:'event',name:'Disney Vacation Club Moonlight Magic',icon:'🌙',pattern:/moonlight magic/i,dates:['2026-10-15'],
   expectedOpen:'21:30',expectedClose:'24:30',hoursReference:'Park schedule corroborated for October 15, 2026',category:'Member-registration event',admissionType:'complimentary_registration',
   admission:'No-charge event for eligible Disney Vacation Club (DVC) members and their registered guests. Advance registration is required; walk-ins are not permitted.',
   eligibility:'The registering member must attend and check in the entire party. Membership eligibility requirements apply.',
   summary:'An exclusive DVC member evening with select attractions, character greetings, entertainment and complimentary treats.',
   highlights:['Select attractions','Character greetings and entertainment','Complimentary special treats'],url:dvcUrl},
  {id:'moonlight-ak-fall-2026',park:'animal_kingdom',kind:'event',name:'Disney Vacation Club Moonlight Magic',icon:'🌙',pattern:/moonlight magic/i,dates:['2026-11-30','2026-12-22'],
   category:'Member-registration event',admissionType:'complimentary_registration',
   admission:'No-charge event for eligible Disney Vacation Club (DVC) members and their registered guests. Advance registration is required; walk-ins are not permitted.',
   eligibility:'The registering member must attend and check in the entire party. Membership eligibility requirements apply.',
   summary:'An exclusive DVC member evening with select attractions, character greetings, entertainment and complimentary treats.',
   highlights:['Select attractions','Character greetings and entertainment','Complimentary special treats'],url:dvcUrl},
  {id:'food-wine-2026',park:'epcot',kind:'festival',name:'EPCOT International Food & Wine Festival',icon:'🍷',pattern:/food\s*(?:&|and)\s*wine/i,
   start:'2026-08-27',end:'2026-11-21',category:'Festival included with park admission',admissionType:'park_admission',
   admission:'Included with valid EPCOT admission. A theme park reservation may be required depending on admission type. Optional dining packages have separate booking requirements.',
   summary:'A celebration of international cuisine, music and family activities at EPCOT.',
   highlights:['Global Marketplaces','Eat to the Beat Concert Series','Emile’s Fromage Montage','Remy’s Ratatouille Hide & Squeak'],
   url:'https://disneyworld.disney.go.com/events-tours/epcot/epcot-international-food-and-wine-festival/'}
 ];
 for(const record of records)record.verifiedOn=VERIFIED_ON;
 const generic=name=>!name||/^(?:special\s+(?:ticketed\s+)?event|ticketed\s+event|private\s+event|event|festival)$/i.test(String(name).trim());
 const inDates=(record,day)=>Array.isArray(record.dates)?record.dates.includes(day):day>=record.start&&day<=record.end;
 function resolve(park,event,day,kind='event'){
  if(!event)return {record:null,status:'no_schedule_entry'};
  const name=String(event.name||''),candidates=records.filter(r=>r.park===park&&r.kind===kind&&inDates(r,day));
  const matched=candidates.filter(r=>generic(name)||r.pattern.test(name));
  if(matched.length!==1)return {record:null,status:'unverified'};
  const record=matched[0],hoursDiffer=!!(record.expectedOpen&&record.expectedClose&&event.open&&event.close&&(event.open!==record.expectedOpen||event.close!==record.expectedClose));
  if(generic(name)&&hoursDiffer)return {record:null,status:'hours_conflict'};
  return {record,status:'verified_park_date',hoursDiffer};
 }
 function enrich(park,event,day,kind='event'){
  if(!event)return null;const result=resolve(park,event,day,kind),record=result.record;
  const providerName=event._providerName||event.name||'';
  return {...event,name:record?record.name:generic(event.name)&&kind==='event'?'Special event':event.name,icon:record?.icon||event.icon,
   isTicketed:record?record.admissionType==='paid_ticket':event.isTicketed,
   admissionType:record?.admissionType||'unconfirmed',_eventMeta:record,_eventMatch:result.status,_eventHoursDiffer:!!result.hoursDiffer,_providerName:providerName};
 }
 const previousScheduled=getParkScheduledEvent;
 getParkScheduledEvent=function(key,park,nowET=new Date()){
  const day=normalizeHours(park?.hours)?.day||curveET(new Date()).day;
  return enrich(key,previousScheduled(key,park,nowET),day,'event');
 };
 const previousFestival=getParkFestival;
 getParkFestival=function(key,park,nowET=new Date()){
  const day=`${nowET.getFullYear()}-${String(nowET.getMonth()+1).padStart(2,'0')}-${String(nowET.getDate()).padStart(2,'0')}`;
  let event=previousFestival(key,park,nowET);
  const foodWine=records.find(r=>r.id==='food-wine-2026');
  if(key==='epcot'&&day.startsWith('2026-')){
   if(event&&foodWine.pattern.test(event.name||'')&&!inDates(foodWine,day))return null;
   if(!event&&inDates(foodWine,day))event={name:foodWine.name,icon:foodWine.icon,sub:'Official 2026 festival calendar'};
  }
  return enrich(key,event,day,'festival');
 };
 window.ParkEventCatalog={version:VERIFIED_ON,records,resolve,enrich};
})();
