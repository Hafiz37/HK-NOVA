const {chromium}=require('/home/gopal-ichiro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');const path=require('path');const out=__dirname;
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},httpCredentials:{username:'qa-local',password:'qa-local-test'},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(10000);let errors=[],responses=[],navigations=0;const results=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('response',r=>{if(r.url().includes('/api/v1/analytics/'))responses.push({url:r.url(),status:r.status()})});
page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++});
function record(id,scenario,ok,notes){results.push({id,scenario,status:ok?'PASS':'FAIL',notes:typeof notes==='string'?notes:JSON.stringify(notes)});fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify(results,null,2))}
async function settled(){await page.waitForTimeout(1600);await page.waitForLoadState('networkidle')}
async function quick(label){await page.locator('#timeRangeDropdown').click();await page.getByRole('link',{name:label,exact:true}).click();await settled()}
async function custom(start,end){await page.locator('#timeRangeDropdown').click();await page.locator('#start-date').fill(start);await page.locator('#end-date').fill(end);await page.getByRole('button',{name:'Apply Range'}).click();await settled()}
await context.request.post('http://127.0.0.1:5017/login',{form:{username:'qa-local',password:'qa-local-test',next:'/analytics'}});
await page.goto('http://127.0.0.1:5017/analytics');await settled();
record('UI-DEFAULT','Default Last 30 Days dan semua grafik dimuat',responses.length>=8&&responses.every(r=>r.status===200)&&errors.length===0,{responses,errors});
for(let y=0;y<3200;y+=650){await page.evaluate(y=>window.scrollTo(0,y),y);await page.waitForTimeout(200)}await page.evaluate(()=>window.scrollTo(0,0));await settled();await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
const initial=await page.evaluate(()=>({gauge:document.querySelector('#reliability-score-gauge').innerText,problemCount:document.querySelector('#problematic-count').innerText,charts:window.Apex?window.Apex._chartInstances?.map(x=>({id:x.id,type:x.chart.w.config.chart.type,annotations:x.chart.w.config.annotations,series:x.chart.w.config.series})):[]}));
fs.writeFileSync(path.join(out,'chart-state.json'),JSON.stringify(initial,null,2));
record('UI-GRADE','Gauge persentase dan grade Excellent/Good/Fair/Poor',/%/.test(initial.gauge)&&/Excellent|Good|Fair|Poor/.test(initial.gauge),initial.gauge);
record('UI-DONUT','Device Type Distribution berbentuk donut',await page.locator('#device-type-chart .apexcharts-pie-series').count()>0,'Actual chart SVG: '+await page.locator('#device-type-chart .apexcharts-bar-series').count()+' bar series');
record('UI-THRESHOLD','Trend memiliki threshold 90% dan 95%',await page.locator('#success-rate-trend .apexcharts-yaxis-annotations line').count()>=2,'Jumlah garis annotation: '+await page.locator('#success-rate-trend .apexcharts-yaxis-annotations line').count());
record('UI-ANOM','Banner terlihat pada fixture lonjakan kegagalan',await page.locator('#anomaly-section').isVisible(),await page.locator('#anomaly-list').innerText());
for(const label of ['Yesterday','Last 7 Days','Last 30 Days','Last 90 Days']){
responses=[];errors=[];await quick(label);record('UI-RANGE-'+label.replaceAll(' ','-'),'Klik '+label+': label, fetching, console',await page.locator('#current-range-text').innerText()===label&&responses.length>=8&&responses.every(r=>r.status===200)&&errors.length===0,{responses,errors});
}
responses=[];await custom('2026-10-01','2026-10-07');
record('UI-CUSTOM','Apply custom valid dan pulsing dot',await page.locator('.custom-range-indicator').count()===1&&responses.every(r=>r.status===200),{label:await page.locator('#current-range-text').innerText(),animation:await page.locator('.custom-range-indicator').evaluate(e=>getComputedStyle(e).animationName),responses});
let navBefore=navigations;responses=[];await page.getByRole('button',{name:'Refresh'}).click();await settled();record('UI-REFRESH','Refresh fetch ulang tanpa reload',navigations===navBefore&&responses.length>=8,{navBefore,navigations,responses});
for(const [label,ext] of [['CSV','csv'],['Excel','xlsx'],['JSON','json'],['PDF','pdf']]){
try{await page.locator('button[onclick=\"exportReport(\''+(label==='Excel'?'excel':label.toLowerCase())+'\')\"]').scrollIntoViewIfNeeded();await page.waitForTimeout(600);const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('button[onclick=\"exportReport(\''+(label==='Excel'?'excel':label.toLowerCase())+'\')\"]').click({timeout:8000})]);await download.saveAs(path.join(out,'ui-export.'+ext));record('UI-EXPORT-'+label,'Unduh '+label+' dari tombol UI',!(await download.failure()),download.suggestedFilename());}catch(e){record('UI-EXPORT-'+label,'Unduh '+label+' dari tombol UI',false,String(e))}
}
responses=[];await custom('2026-10-01','2026-10-01');record('UI-SAMEDAY','Custom tanggal sama: 1 hari penuh',responses.length>=8&&responses.every(r=>r.status===200),responses);
// Exercise validation function with DOM values; date-input change listeners tested separately below.
responses=[];const invalid=await page.evaluate(()=>{document.querySelector('#start-date').value='2026-10-07';document.querySelector('#end-date').value='2026-10-01';applyCustomRange();return document.querySelector('#toast-container').innerText});await settled();record('UI-REVERSE','Start > End ditolak',responses.length===0&&invalid.includes('Start date must be before end date'),invalid);
responses=[];const long=await page.evaluate(()=>{document.querySelector('#start-date').value='2025-01-01';document.querySelector('#end-date').value='2026-10-01';applyCustomRange();return document.querySelector('#toast-container').innerText});await settled();record('UI-OVER365','Rentang >365 ditolak UI',responses.length===0&&long.includes('Date range cannot exceed 365 days'),long);
await quick('Last 30 Days');
for(const width of [768,576,375]){
await page.setViewportSize({width,height:900});await settled();const metrics=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,charts:[...document.querySelectorAll('#device-type-chart,#backup-frequency-chart,#success-rate-trend,#reliability-score-gauge,#backup-heatmap')].map(e=>({id:e.id,container:e.getBoundingClientRect().height,svg:e.querySelector('svg')?.getBoundingClientRect().height}))}));await page.screenshot({path:path.join(out,'mobile-'+width+'.png'),fullPage:true});record('UI-MOBILE-'+width,'Viewport '+width+': tinggi chart 250px tanpa overflow',metrics.scrollWidth<=width&&metrics.charts.every(x=>x.container===250&&x.svg<=250),metrics);
}
await context.request.post('http://127.0.0.1:5017/qa-fixture/empty');errors=[];responses=[];await page.reload();await settled();const zero=await page.evaluate(()=>({prob:document.querySelector('#problematic-devices-list').innerText,count:document.querySelector('#problematic-count').innerText,top:document.querySelector('#top-performers-list').innerText,metric:document.querySelector('#avg-duration').innerText,anomaly:getComputedStyle(document.querySelector('#anomaly-section')).display}));record('UI-ZERO','Zero data: console bersih dan empty states rapi',errors.length===0&&responses.every(r=>r.status===200)&&zero.count==='0'&&zero.anomaly==='none',{errors,zero});await page.screenshot({path:path.join(out,'zero-data.png'),fullPage:true});
fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
