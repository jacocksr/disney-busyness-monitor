import asyncio, base64, datetime, hashlib, json, sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://candidate.test'
PREFIX = '/disney-busyness-monitor/'

SNAPSHOT = r"""() => {
 if(typeof Chart!=='undefined') for(const c of Object.values(Chart.instances)){c.stop();c.update('none');}
 const styles=[...document.querySelectorAll('#parkGrid,#ridesTable,#heatmapTable,#weatherPanel,#pcAvailabilityPanel,.ride-modal')].map(e=>{
 const c=getComputedStyle(e),r=e.getBoundingClientRect();
 return [e.id,e.className,c.display,c.color,c.backgroundColor,c.fontFamily,c.fontSize,Math.round(r.width*10)/10,Math.round(r.height*10)/10];});
 return {text:document.body.innerText,styles,park:activeParkKey,mode:heatmapMode,theme:document.documentElement.dataset.theme,
 cards:document.querySelectorAll('#parkGrid .park-card').length,
 modals:[...document.querySelectorAll('.modal-overlay.active')].map(e=>e.id),
 charts:typeof Chart==='undefined'?[]:Object.values(Chart.instances).map(c=>({canvas:c.canvas.id,labels:c.data.labels,data:c.data.datasets.map(d=>({label:d.label,data:d.data})),image:c.canvas.toDataURL()}))};
}"""

def captured_resources(har_path):
 har=json.loads(Path(har_path).read_text(encoding='utf-8'));resources={}
 for e in har['log']['entries']:
  c=e['response'].get('content',{});text=c.get('text')
  if text is None:continue
  body=base64.b64decode(text) if c.get('encoding')=='base64' else text.encode()
  resources[e['request']['url']]={'body':body,'mime':c.get('mimeType','application/octet-stream'),'status':e['response']['status']}
 return resources

async def exercise(browser,resources,kind,width,theme):
 context=await browser.new_context(viewport={'width':width,'height':900},color_scheme=theme,reduced_motion='reduce',timezone_id='America/New_York')
 page=await context.new_page();page.set_default_timeout(8000);errors=[];missing=set();snapshots={}
 page.on('pageerror',lambda e:errors.append(str(e)))
 await page.clock.set_fixed_time(datetime.datetime(2026,10,18,17,25,13,200000,tzinfo=datetime.timezone.utc))
 async def route(r):
  url=r.request.url;u=urlsplit(url)
  if url==ORIGIN+PREFIX:
   path=ROOT/'tests/reference.html' if kind=='reference' else ROOT/'index.html'
   await r.fulfill(status=200,content_type='text/html',body=path.read_bytes());return
  if u.netloc=='candidate.test' and u.path.startswith(PREFIX):
   relative=u.path[len(PREFIX):];local=ROOT/relative
   if relative.startswith(('assets/','images/')) and local.is_file():
    mime='text/css' if local.suffix=='.css' else 'image/png' if local.suffix=='.png' else 'application/javascript'
    await r.fulfill(status=200,content_type=mime,body=local.read_bytes());return
  if url in resources:
   d=resources[url];await r.fulfill(status=d['status'],content_type=d['mime'],headers={'Access-Control-Allow-Origin':'*'},body=d['body']);return
  missing.add(url);await r.abort()
 await page.route('**/*',route)
 async def save(name):
  await page.evaluate('window.scrollTo(0,0)');await page.wait_for_timeout(100)
  snap=await page.evaluate(SNAPSHOT)
  for c in snap['charts']:c['image']=hashlib.sha256(c['image'].encode()).hexdigest()
  snapshots[name]=snap
 try:
  await page.goto(ORIGIN+PREFIX,wait_until='networkidle')
  await page.wait_for_function('typeof Chart!=="undefined" && document.querySelectorAll("#parkGrid .park-card").length===4 && window.ParkClosureUI?.getPayload()!==null')
  await page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}')
  await page.evaluate('document.fonts.ready');await page.wait_for_timeout(250)
  await save('initial')
  for key in ['magic_kingdom','epcot','hollywood_studios','animal_kingdom']:
   await page.evaluate('(key)=>selectPark(key)',key);await save('park-'+key)
  await page.evaluate("selectPark('magic_kingdom')")
  await page.locator('#rideSearch').fill('space');await save('search')
  await page.locator('#rideSearch').fill('')
  for mode in ['daily','weekday','hour']:
   await page.locator(f'.heatmap-tab[onclick*="\'{mode}\'"]').click(force=True);await save('heatmap-'+mode)
  await page.locator('#weatherPanel > summary').click(force=True);await save('weather')
  await page.locator('#pcAvailabilityPanel > summary').click(force=True);await save('closures')
  await page.locator('#ridesBody tr.ride-row').first.click(force=True);await page.wait_for_timeout(200);await save('ride-popup')
  await page.keyboard.press('Escape');await save('ride-popup-closed')
  await page.locator('#themeToggleBtn').click(force=True);await page.wait_for_timeout(300);await save('theme')
 finally:
  await context.close()
 return {'snapshots':snapshots,'page_errors':errors,'missing_resources':sorted(missing)}

async def compare_matrix(har_path,configurations):
 resources=captured_resources(har_path);report={}
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,theme in configurations:
   original,candidate=await asyncio.gather(exercise(browser,resources,'reference',width,theme),exercise(browser,resources,'candidate',width,theme))
   differences={name:[field for field,value in state.items() if value!=candidate['snapshots'].get(name,{}).get(field)] for name,state in original['snapshots'].items() if state!=candidate['snapshots'].get(name)}
   report[f'{width}-{theme}']={'checkpoints':len(original['snapshots']),'matched':len(original['snapshots'])-len(differences),'differences':differences,'reference_errors':original['page_errors'],'candidate_errors':candidate['page_errors'],'missing_resources':candidate['missing_resources']}
  await browser.close()
 return report

if __name__=='__main__':
 if len(sys.argv)<2:raise SystemExit('Usage: python tests/check_candidate.py /path/to/networktest.har')
 report=asyncio.run(compare_matrix(sys.argv[1],[(1280,'dark'),(390,'dark'),(1280,'light'),(390,'light')]))
 output=ROOT/'tests/latest-parity-results.json';output.write_text(json.dumps(report,indent=2),encoding='utf-8')
 print(json.dumps(report,indent=2))
 raise SystemExit(1 if any(v['differences'] or v['reference_errors'] or v['candidate_errors'] for v in report.values()) else 0)
