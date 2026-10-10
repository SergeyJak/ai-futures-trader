export const dashboardHtml = `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f6f8fc"><title>AI Futures · Market Monitor</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#1b2740;background:#f6f8fc}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:20px 16px 70px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 28px}.brand{font-size:21px;font-weight:800;letter-spacing:-.5px}.brand span{color:#5575df}.status{display:inline-flex;align-items:center;gap:7px;background:#e8f7ee;color:#157047;padding:8px 12px;border-radius:40px;font-size:13px;font-weight:700}.dot{height:8px;width:8px;background:currentColor;border-radius:50%}h1{font-size:clamp(27px,5vw,38px);margin:0 0 6px;letter-spacing:-1px}p{color:#657389;margin:0}.intro{margin-bottom:25px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:#fff;border:1px solid #e5ebf4;border-radius:18px;padding:20px;box-shadow:0 2px 10px #10224706}.metric-label{font-size:13px;color:#68758a}.metric-value{font-size:26px;font-weight:780;margin-top:12px;letter-spacing:-.5px}.metric-note{font-size:12px;color:#78859a;margin-top:5px}.section{margin:26px 0 12px;display:flex;justify-content:space-between;align-items:center}.section h2{font-size:20px;margin:0}.symbols{display:flex;gap:8px;flex-wrap:wrap}.tab{border:1px solid #dde5f1;border-radius:9px;background:#fff;color:#41516c;padding:9px 14px;font-weight:700;cursor:pointer}.tab.active{color:#fff;background:#4969d8;border-color:#4969d8}.plot{width:100%;height:260px;display:block}.plot-wrap{position:relative;min-height:260px}.plot-empty{position:absolute;inset:0;display:grid;place-items:center;color:#8794a7}.charthead{display:flex;align-items:baseline;gap:12px;margin-bottom:8px}.price{font-size:28px;font-weight:800}.muted{font-size:13px;color:#7a8799}.coin-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.coin strong{font-size:18px}.coin .count{font-weight:750;font-size:24px;margin-top:12px}.ok{color:#13764b}.warn{color:#ba741e}.error{color:#c14242}.foot{margin-top:25px;text-align:center;font-size:12px;color:#8290a4}.skeleton{opacity:.6}button:focus-visible{outline:3px solid #9fb3ff;outline-offset:2px}@media(max-width:750px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.coin-list{grid-template-columns:1fr}.wrap{padding:18px 13px 45px}.card{padding:16px}.metric-value{font-size:22px}header{padding-bottom:23px}.plot{height:220px}.plot-wrap{min-height:220px}}
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
<div class="card"><div class="charthead"><div class="price" id="price">…</div><span class="muted" id="last-time"></span></div><div class="plot-wrap"><svg id="plot" class="plot" viewBox="0 0 900 260" preserveAspectRatio="none" role="img" aria-label="Price chart"><path id="area" fill="#e6edff"></path><path id="line" fill="none" stroke="#4969d8" stroke-width="3" vector-effect="non-scaling-stroke"></path></svg><div id="plot-empty" class="plot-empty" hidden>Loading candles…</div></div><div class="muted">Most recent 180 confirmed 1-minute candles · UTC timestamps</div></div>
<div class="section"><h2>Data collection</h2><span class="muted" id="updated">Updating…</span></div>
<div class="coin-list" id="coins"></div>
<div class="foot">Market monitoring only. No orders, account access or trading enabled. Refreshes every 30 seconds.</div>
</div>
<script>
'use strict';
var active='BTCUSDT';var symbols=['BTCUSDT','ETHUSDT','SOLUSDT'];
var fmt=new Intl.NumberFormat('en-US');var usd=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
function set(id,s){document.getElementById(id).textContent=s}
function mb(bytes){return (Number(bytes)/1048576).toFixed(2)+' MB'}
async function json(path){var r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
function chart(rows){
 var prices=rows.map(function(x){return Number(x.close)}).filter(Number.isFinite);
 var area=document.getElementById('area'),line=document.getElementById('line'),empty=document.getElementById('plot-empty');
 if(prices.length<2){line.setAttribute('d','');area.setAttribute('d','');empty.hidden=false;empty.textContent='Not enough price data';return}
 empty.hidden=true;var lo=Math.min.apply(null,prices),hi=Math.max.apply(null,prices),diff=hi-lo||1;
 var pts=prices.map(function(v,i){return [20+i*860/(prices.length-1),220-(v-lo)/diff*190]});
 var d=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)}).join(' ');
 line.setAttribute('d',d);area.setAttribute('d',d+' L '+pts[pts.length-1][0].toFixed(2)+' 240 L 20 240 Z');
 set('price','$'+usd.format(prices[prices.length-1]));set('last-time',new Date(rows[rows.length-1].start_at).toISOString().slice(0,16).replace('T',' ')+' UTC');
}
async function loadChart(){
 try{var data=await json('/api/candles?symbol='+encodeURIComponent(active)+'&limit=180');chart(data.candles)}
 catch(e){document.getElementById('plot-empty').hidden=false;set('plot-empty','Chart unavailable')}
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
refresh();setInterval(refresh,30000);
</script></body></html>`;
