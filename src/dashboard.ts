export const dashboardHtml = `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f6f8fc"><title>AI Futures · Market Monitor</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#1b2740;background:#f6f8fc}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:20px 16px 70px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 28px}.brand{font-size:21px;font-weight:800;letter-spacing:-.5px}.brand span{color:#5575df}.status{display:inline-flex;align-items:center;gap:7px;background:#e8f7ee;color:#157047;padding:8px 12px;border-radius:40px;font-size:13px;font-weight:700}.dot{height:8px;width:8px;background:currentColor;border-radius:50%}h1{font-size:clamp(27px,5vw,38px);margin:0 0 6px;letter-spacing:-1px}p{color:#657389;margin:0}.intro{margin-bottom:25px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:#fff;border:1px solid #e5ebf4;border-radius:18px;padding:20px;box-shadow:0 2px 10px #10224706}.metric-label{font-size:13px;color:#68758a}.metric-value{font-size:26px;font-weight:780;margin-top:12px;letter-spacing:-.5px}.metric-note{font-size:12px;color:#78859a;margin-top:5px}.section{margin:26px 0 12px;display:flex;justify-content:space-between;align-items:center}.section h2{font-size:20px;margin:0}.symbols{display:flex;gap:8px;flex-wrap:wrap}.chart-controls{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px}.control-group{display:flex;gap:7px;flex-wrap:wrap}.inspect{background:#f3f6fc;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12px;color:#455674;min-height:35px}.zoom-controls{display:flex;align-items:center;gap:6px}.plot{touch-action:pan-y;cursor:crosshair;user-select:none}.chart-meta{display:flex;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap}.tab{border:1px solid #dde5f1;border-radius:9px;background:#fff;color:#41516c;padding:9px 14px;font-weight:700;cursor:pointer}.tab.active{color:#fff;background:#4969d8;border-color:#4969d8}.plot{width:100%;height:260px;display:block}.plot-wrap{position:relative;min-height:260px}.plot-empty[hidden]{display:none!important}.plot-empty{position:absolute;inset:0;display:grid;place-items:center;color:#8794a7}.charthead{display:flex;align-items:baseline;gap:12px;margin-bottom:8px}.price{font-size:28px;font-weight:800}.muted{font-size:13px;color:#7a8799}.coin-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.coin strong{font-size:18px}.coin .count{font-weight:750;font-size:24px;margin-top:12px}.ok{color:#13764b}.warn{color:#ba741e}.error{color:#c14242}.foot{margin-top:25px;text-align:center;font-size:12px;color:#8290a4}.skeleton{opacity:.6}button:focus-visible{outline:3px solid #9fb3ff;outline-offset:2px}@media(max-width:750px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.coin-list{grid-template-columns:1fr}.wrap{padding:18px 13px 45px}.card{padding:16px}.metric-value{font-size:22px}header{padding-bottom:23px}.plot{height:220px}.plot-wrap{min-height:220px}}
</style></head><body><div class="wrap">
<header><div class="brand">AI <span>Futures</span> <small style="font-weight:500;color:#8795a9">/ Monitor</small></div><div class="status" id="status"><span class="dot"></span><span id="status-text">Connecting</span></div></header>
<div class="intro"><h1>Market overview</h1><p>Bybit USDT Perpetual · 1-minute candles · read-only</p></div>
<div class="grid">
<div class="card"><div class="metric-label">Confirmed candles</div><div class="metric-value" id="candles">…</div><div class="metric-note">BTC · ETH · SOL</div></div>
<div class="card"><div class="metric-label">Missing minutes</div><div class="metric-value" id="gaps">…</div><div class="metric-note">Since collection started</div></div>
<div class="card"><div class="metric-label">Database size</div><div class="metric-value" id="dbsize">…</div><div class="metric-note">PostgreSQL</div></div>
<div class="card"><div class="metric-label">Candle storage</div><div class="metric-value" id="tablesize">…</div><div class="metric-note">Table and indexes</div></div>
</div>
<div class="section"><h2>Price history</h2><div class="symbols"><button class="tab active" data-symbol="BTCUSDT">BTC</button><button class="tab" data-symbol="ETHUSDT">ETH</button><button class="tab" data-symbol="SOLUSDT">SOL</button></div></div>
<div class="card"><div class="chart-controls"><div class="control-group"><button class="tab active" data-mode="line">Линия</button><button class="tab" data-mode="candles">Свечи</button></div><div class="control-group"><button class="tab active" data-period="60">1ч</button><button class="tab" data-period="360">6ч</button><button class="tab" data-period="1440">24ч</button></div></div><div class="chart-controls"><span class="muted">Листайте график вбок · нажмите свечу для OHLC</span><div class="zoom-controls"><button class="tab" id="older" aria-label="Ранее">←</button><button class="tab" id="zoom-out" aria-label="Уменьшить">−</button><button class="tab" id="zoom-in" aria-label="Увеличить">+</button><button class="tab" id="latest">Сейчас</button></div></div><div class="charthead"><div class="price" id="price">…</div><span class="muted" id="last-time"></span></div><div class="plot-wrap"><svg id="plot" class="plot" viewBox="0 0 900 260" preserveAspectRatio="none" role="img" aria-label="Price chart"><g id="grid-lines"></g><path id="area" fill="#e6edff"></path><path id="line" fill="none" stroke="#4969d8" stroke-width="3" vector-effect="non-scaling-stroke"></path><g id="candle-bars"></g><line id="crosshair" x1="0" y1="20" x2="0" y2="240" stroke="#7187af" stroke-dasharray="4 3" visibility="hidden" pointer-events="none"></line></svg><div id="plot-empty" class="plot-empty" hidden>Loading candles…</div></div><div class="inspect" id="inspect" aria-live="polite">Коснитесь графика, чтобы увидеть данные свечи</div><div class="chart-meta muted"><span id="chart-range">Последние 60 минут · UTC</span><span id="change">Изменение: …</span></div></div>
<div class="section"><h2>Data collection</h2><span class="muted" id="updated">Updating…</span></div>
<div class="coin-list" id="coins"></div>
<div class="foot">Market monitoring only. No orders, account access or trading enabled. Refreshes every 30 seconds.</div>
</div>
<script>
'use strict';
var active='BTCUSDT',mode='line',period=60,chartRequest=0,allRows=[],offset=0,visibleCount=60,touchX=null;var symbols=['BTCUSDT','ETHUSDT','SOLUSDT'];
var fmt=new Intl.NumberFormat('en-US');var usd=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
function set(id,s){document.getElementById(id).textContent=s}
function mb(bytes){return (Number(bytes)/1048576).toFixed(2)+' MB'}
async function json(path){var r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
function aggregate(rows,step){
 if(step===1)return rows;
 var out=[];
 rows.forEach(function(row){
  var time=Date.parse(row.start_at),bucket=Math.floor(time/(step*60000));
  var last=out[out.length-1];
  if(last&&last.bucket===bucket){
   last.high=Math.max(last.high,Number(row.high));
   last.low=Math.min(last.low,Number(row.low));
   last.close=Number(row.close);
  }else{out.push({bucket:bucket,start_at:row.start_at,open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close)})}
 });
 return out;
}
function viewport(){
 var max=Math.max(0,allRows.length-visibleCount);
 offset=Math.min(max,Math.max(0,offset));
 return allRows.slice(Math.max(0,allRows.length-offset-visibleCount),allRows.length-offset);
}
function inspectIndex(index){
 var rows=viewport(),r=rows[Math.max(0,Math.min(rows.length-1,index))];
 if(!r)return;
 var t=new Date(r.start_at).toISOString().slice(0,16).replace('T',' ')+' UTC';
 set('inspect',t+' | O '+usd.format(Number(r.open))+'  H '+usd.format(Number(r.high))+'  L '+usd.format(Number(r.low))+'  C '+usd.format(Number(r.close)));
 var x=mode==='candles'?20+(Math.max(0,Math.min(rows.length-1,index))+.5)*860/rows.length:20+Math.max(0,Math.min(rows.length-1,index))*860/Math.max(1,rows.length-1);
 var hair=document.getElementById('crosshair');hair.setAttribute('x1',String(x));hair.setAttribute('x2',String(x));hair.setAttribute('visibility','visible');
}
function redraw(){chart(viewport())}
function chart(rows){
 var area=document.getElementById('area'),line=document.getElementById('line');
 var bars=document.getElementById('candle-bars'),grid=document.getElementById('grid-lines');
 var empty=document.getElementById('plot-empty');
 area.setAttribute('d','');line.setAttribute('d','');bars.replaceChildren();grid.replaceChildren();
 if(rows.length<2){empty.hidden=false;empty.textContent='Недостаточно данных для графика';return}
 empty.hidden=true;
 var first=Number(rows[0].open),last=Number(rows[rows.length-1].close);
 var delta=(last-first)/first*100;
 set('price','$'+usd.format(last));set('change',(delta>=0?'+':'')+delta.toFixed(2)+'% за период');
 set('last-time',new Date(rows[rows.length-1].start_at).toISOString().slice(0,16).replace('T',' ')+' UTC');
 var lo=Math.min.apply(null,rows.map(function(r){return Number(r.low)}));
 var hi=Math.max.apply(null,rows.map(function(r){return Number(r.high)}));
 var pad=(hi-lo)*0.06||hi*.0005||1;lo-=pad;hi+=pad;
 function y(v){return 230-(v-lo)/(hi-lo)*200}
 var ns='http://www.w3.org/2000/svg';
 function shape(tag,attrs,parent){var el=document.createElementNS(ns,tag);Object.keys(attrs).forEach(function(k){el.setAttribute(k,String(attrs[k]))});parent.appendChild(el);return el}
 for(var j=0;j<=4;j++){var gy=30+j*50;shape('line',{x1:12,y1:gy,x2:888,y2:gy,stroke:'#eaf0f8','stroke-width':1},grid)}
 if(mode==='candles'){
  var space=860/rows.length,body=Math.max(1.8,Math.min(13,space*.68));
  rows.forEach(function(r,i){
   var x=20+(i+.5)*space,up=Number(r.close)>=Number(r.open),color=up?'#15966e':'#df5c66';
   shape('line',{x1:x,x2:x,y1:y(Number(r.high)),y2:y(Number(r.low)),stroke:color,'stroke-width':1.5},bars);
   var top=Math.min(y(Number(r.open)),y(Number(r.close)));
   shape('rect',{x:x-body/2,y:top,width:body,height:Math.max(1,Math.abs(y(Number(r.open))-y(Number(r.close)))),rx:body>5?1:0,fill:color},bars);
  });
 }else{
  var pts=rows.map(function(r,i){return [20+i*860/(rows.length-1),y(Number(r.close))]});
  var d=pts.map(function(p,i){return(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)}).join(' ');
  line.setAttribute('d',d);area.setAttribute('d',d+' L '+pts[pts.length-1][0].toFixed(2)+' 240 L 20 240 Z');
 }
 set('chart-range',period===60?'1 час':period===360?'6 часов':'24 часа');
}
async function loadChart(){
 var request=++chartRequest,chosen=active,minutes=period;
 try{
  var data=await json('/api/candles?symbol='+encodeURIComponent(chosen)+'&limit='+minutes);
  if(request!==chartRequest)return;
  allRows=aggregate(data.candles,minutes===60?1:minutes===360?5:15);offset=0;visibleCount=Math.min(60,allRows.length);document.getElementById('crosshair').setAttribute('visibility','hidden');set('inspect','Коснитесь графика, чтобы увидеть данные свечи');redraw();
 }catch(e){if(request===chartRequest){document.getElementById('plot-empty').hidden=false;set('plot-empty','График недоступен')}}
}
async function refresh(){
 try{
 var d=await json('/api/overview');var total=d.symbols.reduce(function(v,x){return v+Number(x.confirmed)},0);
 var gaps=d.symbols.reduce(function(v,x){return v+Number(x.missing_minutes)},0);
 set('candles',fmt.format(total));set('gaps',fmt.format(gaps));set('dbsize',mb(d.storage.database_bytes));set('tablesize',mb(d.storage.candles_total_bytes));
 var connected=d.stream.connected&&Date.now()-d.stream.lastDataAt<90000;set('status-text',connected?'Collecting':'Stream offline');
 document.getElementById('status').style.cssText=connected?'':'background:#fff0e6;color:#ac5418';
 var container=document.getElementById('coins');container.replaceChildren();
 symbols.forEach(function(symbol){
 var s=d.symbols.find(function(r){return r.symbol===symbol})||{};
 var article=document.createElement('article');article.className='card coin';
 var title=document.createElement('strong');title.textContent=symbol;article.appendChild(title);
 var n=document.createElement('div');n.className='count';n.textContent=fmt.format(Number(s.confirmed||0))+' candles';article.appendChild(n);
 var note=document.createElement('div');note.className='metric-note';note.textContent=Number(s.missing_minutes||0)+' missing minutes · latest: '+(s.last_at?new Date(s.last_at).toISOString().slice(11,16)+' UTC':'none');article.appendChild(note);
 container.appendChild(article)});
 set('updated','Checked '+new Date().toLocaleTimeString());
 }catch(e){set('status-text','API unavailable');document.getElementById('status').style.cssText='background:#ffeded;color:#b73333';set('updated','Cannot reach server')}
 await loadChart();
}
document.querySelectorAll('[data-symbol]').forEach(function(el){el.addEventListener('click',function(){active=el.dataset.symbol;document.querySelectorAll('[data-symbol]').forEach(function(tab){tab.classList.toggle('active',tab===el)});void loadChart()})});
document.querySelectorAll('[data-mode]').forEach(function(el){el.addEventListener('click',function(){mode=el.dataset.mode;document.querySelectorAll('[data-mode]').forEach(function(tab){tab.classList.toggle('active',tab===el)});void loadChart()})});
document.querySelectorAll('[data-period]').forEach(function(el){el.addEventListener('click',function(){period=Number(el.dataset.period);document.querySelectorAll('[data-period]').forEach(function(tab){tab.classList.toggle('active',tab===el)});void loadChart()})});
var svg=document.getElementById('plot');
svg.addEventListener('pointerdown',function(e){
 if(e.pointerType==='touch')touchX=e.clientX;
});
svg.addEventListener('pointerup',function(e){
 if(touchX!==null&&Math.abs(e.clientX-touchX)>22){
  offset+=Math.round((e.clientX-touchX)/Math.max(1,svg.clientWidth)*visibleCount);
  offset=Math.max(0,Math.min(allRows.length-visibleCount,offset));redraw();touchX=null;return;
 }
 touchX=null;
 var rect=svg.getBoundingClientRect();
 var x=(e.clientX-rect.left)/rect.width*900;
 var rows=viewport();
 if(rows.length){var idx=mode==='candles'?Math.floor((x-20)/860*rows.length):Math.round((x-20)/860*(rows.length-1));inspectIndex(idx)}
});
svg.addEventListener('wheel',function(e){
 if(!allRows.length)return;
 e.preventDefault();
 if(e.ctrlKey){visibleCount=Math.max(12,Math.min(allRows.length,visibleCount+(e.deltaY>0?12:-12)))}
 else{offset=Math.max(0,Math.min(allRows.length-visibleCount,offset+(e.deltaY>0?10:-10)))}
 redraw();
},{passive:false});
document.getElementById('zoom-in').addEventListener('click',function(){visibleCount=Math.max(12,visibleCount-12);redraw()});
document.getElementById('zoom-out').addEventListener('click',function(){visibleCount=Math.min(allRows.length,visibleCount+12);redraw()});
document.getElementById('older').addEventListener('click',function(){offset=Math.min(Math.max(0,allRows.length-visibleCount),offset+Math.max(5,Math.floor(visibleCount/2)));redraw()});
document.getElementById('latest').addEventListener('click',function(){offset=0;redraw()});
refresh();setInterval(refresh,30000);
</script></body></html>`;
