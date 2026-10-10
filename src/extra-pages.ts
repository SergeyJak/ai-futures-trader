const css = `<style>
:root{font-family:Inter,system-ui,-apple-system,sans-serif;color:#1b2840;background:#f6f8fc}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1100px;margin:auto;padding:24px 17px 60px}a{color:#4266d3}header{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}nav{display:flex;gap:16px;flex-wrap:wrap;padding:21px 0}nav a{text-decoration:none;font-weight:700;font-size:14px}.card{background:#fff;border:1px solid #e0e8f2;border-radius:17px;margin:15px 0;padding:20px;box-shadow:0 2px 10px #192c4a08}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat{font-size:24px;font-weight:800;margin:7px 0}.muted,.meta{color:#697992;font-size:13px}h1{font-size:28px;margin:6px 0}h2{font-size:19px;margin:0 0 12px}select{padding:9px 14px;border:1px solid #d2dcea;border-radius:9px;background:white;font-size:14px}button{padding:8px 13px;border-radius:9px;border:1px solid #d2dcea;background:white;cursor:pointer}button.active{background:#4366db;color:white}.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:15px 0}.chart{height:320px;position:relative;touch-action:pan-y}.chart svg{cursor:crosshair}.chart svg{width:100%;height:100%;display:block}.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#64748b}.legend i{width:10px;height:10px;display:inline-block;margin-right:5px;border-radius:2px}.up{color:#14926a}.down{color:#ca5362}.tablewrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #edf1f6;white-space:nowrap}th{color:#697992;font-size:12px}p{line-height:1.5;color:#63728a}.error{color:#be4252}.positive{color:#14926a}.negative{color:#ca5362}@media(max-width:690px){.grid{grid-template-columns:1fr 1fr}.wrap{padding:16px 12px 40px}.card{padding:14px}.chart{height:270px}h1{font-size:24px}}
</style>`;
const shell=(title:string,body:string)=>`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Futures · ${title}</title>${css}</head><body><main class="wrap"><header><strong>AI Futures</strong><span class="meta">Paper trading · Bybit</span></header><nav><a href="/">Тестовая торговля</a><a href="/analytics">Аналитика</a><a href="/market">Рынок и сигналы</a><a href="/research">Новые стратегии</a></nav><h1>${title}</h1>${body}</main></body></html>`;
const runtime = `<script>
'use strict';
const $=id=>document.getElementById(id);
const fmt=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toFixed(d):'—';
const cash=n=>'$'+fmt(n);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(url){const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);return res.json()}
function msg(id,e){$(id).textContent='Не удалось загрузить данные: '+String(e)}
function barChart(element,data,labels,opts={}){
 if(!data.length){element.innerHTML='<p>Нет данных для графика</p>';return}
 const values=data.map(v=>Number(v)||0),max=Math.max(1,...values.map(Math.abs));
 let svg='<svg viewBox="0 0 900 300" preserveAspectRatio="none" role="img" aria-label="Сравнительный график">';
 const base=opts.signed?150:270,range=opts.signed?115:230,w=830/values.length;
 svg+='<line x1="45" x2="890" y1="'+base+'" y2="'+base+'" stroke="#b3c0d0"/>';
 values.forEach((v,i)=>{const h=Math.max(v===0?1:2,Math.abs(v)/max*range),x=50+i*w+Math.max(1,w*.18),y=v>=0?base-h:base;svg+='<rect x="'+x+'" y="'+y+'" width="'+Math.max(5,w*.64)+'" height="'+h+'" rx="4" fill="'+(v>=0?'#486cdb':'#d55c6d')+'"><title>'+esc(labels[i])+': '+fmt(v,2)+'</title></rect>';svg+='<text x="'+(x+w*.32)+'" y="292" font-size="11" fill="#5d6a80" text-anchor="middle">'+esc(labels[i])+'</text>';});
 element.innerHTML=svg+'</svg>';
}
function candleChart(element,candles,positions=[],visible=100,offset=0){
 if(!candles.length){element.innerHTML='<p>Свечей пока нет</p>';return}
 const end=Math.max(0,candles.length-offset),start=Math.max(0,end-visible);
 const a=candles.slice(start,end);
 if(!a.length){element.innerHTML='<p>Нет свечей для этого диапазона</p>';return}
 const relevant=positions.filter(p=>{const at=Date.parse(p.entryAt||p.entry_at);const exit=p.exitAt||p.exit_at;return Number.isFinite(at)&&at<=Date.parse(a.at(-1).start_at)+60000&&(!exit||Date.parse(exit)>=Date.parse(a[0].start_at))});
 const prices=a.flatMap(b=>[Number(b.high),Number(b.low)]);
 for(const p of relevant){for(const n of [p.entry||p.entry_price,p.stop,p.take,p.exit||p.exit_price])if(Number.isFinite(Number(n)))prices.push(Number(n))}
 const hi=Math.max(...prices),lo=Math.min(...prices),span=Math.max(.000001,hi-lo),w=850/a.length;
 const yy=n=>260-(Number(n)-lo)/span*215;
 let svg='<svg viewBox="0 0 930 310" preserveAspectRatio="none" role="img" aria-label="Свечной график">';
 for(let i=0;i<=4;i++){const y=45+i*54;svg+='<line x1="45" x2="895" y1="'+y+'" y2="'+y+'" stroke="#eef1f6"/>';svg+='<text x="4" y="'+(y+4)+'" font-size="11" fill="#738299">'+fmt(hi-span*i/4,2)+'</text>'}
 a.forEach((b,i)=>{const o=Number(b.open),v=Number(b.close),h=Number(b.high),l=Number(b.low),x=45+(i+.5)*w,color=v>=o?'#159a70':'#d65d71';svg+='<line x1="'+x+'" x2="'+x+'" y1="'+yy(h)+'" y2="'+yy(l)+'" stroke="'+color+'" stroke-width="1.5"/>';svg+='<rect x="'+(x-Math.max(1,w*.35))+'" y="'+Math.min(yy(o),yy(v))+'" width="'+Math.max(2,w*.7)+'" height="'+Math.max(1,Math.abs(yy(v)-yy(o)))+'" fill="'+color+'"><title>'+esc(b.start_at)+' O '+o+' H '+h+' L '+l+' C '+v+'</title></rect>'});
 for(const p of relevant){
  const entered=Date.parse(p.entryAt||p.entry_at),left=p.exitAt||p.exit_at?Date.parse(p.exitAt||p.exit_at):Infinity;
  const x1=45+Math.max(0,Math.min(a.length,(entered-Date.parse(a[0].start_at))/60000))*w;
  const x2=45+Math.max(0,Math.min(a.length,(left-Date.parse(a[0].start_at))/60000))*w;
  const entry=Number(p.entry||p.entry_price);
  if(!Number.isFinite(entry))continue;
  const draw=(n,color,label,dash)=>{if(!Number.isFinite(Number(n)))return;svg+='<line x1="'+x1+'" x2="'+Math.max(x1+2,x2)+'" y1="'+yy(n)+'" y2="'+yy(n)+'" stroke="'+color+'" stroke-width="2" '+(dash?'stroke-dasharray="5 4"':'')+'><title>'+esc(label)+' '+fmt(n)+'</title></line>'};
  draw(entry,'#486cdb','Вход',false);draw(p.stop,'#d45b65','Stop Loss',true);draw(p.take,'#14885e','Take Profit',true);
  svg+='<circle cx="'+x1+'" cy="'+yy(entry)+'" r="5" fill="#486cdb"><title>Вход '+esc(p.side)+' '+fmt(entry)+'</title></circle>';
  const exit=Number(p.exit||p.exit_price);
  if(Number.isFinite(exit)&&left!==Infinity&&left>=Date.parse(a[0].start_at)&&left<=Date.parse(a.at(-1).start_at)+60000)svg+='<circle cx="'+x2+'" cy="'+yy(exit)+'" r="5" fill="#ef923c"><title>Выход '+fmt(exit)+'</title></circle>';
 }
 svg+='<text x="46" y="295" font-size="12" fill="#738299">'+esc(a[0].start_at.slice(5,16))+'</text><text x="895" text-anchor="end" y="295" font-size="12" fill="#738299">'+esc(a.at(-1).start_at.slice(5,16))+'</text>';
 element.innerHTML=svg+'</svg>';
}
function table(element,head,rows){const t=document.createElement('table');const h=document.createElement('tr');head.forEach(x=>{const c=document.createElement('th');c.textContent=x;h.appendChild(c)});t.appendChild(h);rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td)});t.appendChild(tr)});element.replaceChildren(t)}
</script>`;
export const marketHtml=shell('Рынок и сигналы',`<p>Минутные свечи Bybit с масштабом, прокруткой и отметками виртуальных сделок.</p><div class="toolbar"><label for="symbol">Инструмент</label><select id="symbol"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select><label for="limit">Загрузить</label><select id="limit"><option value="180">3 часа</option><option value="720">12 часов</option><option value="1440" selected>24 часа</option></select><label for="account">Виртуальный счёт</label><select id="account"><option value="0">Без сделок</option></select><button id="reload">Обновить</button></div><div class="grid"><div class="card"><div class="muted">Последняя цена</div><div class="stat" id="price">…</div></div><div class="card"><div class="muted">RSI (14)</div><div class="stat" id="rsi">…</div></div><div class="card"><div class="muted">Сигнал</div><div class="stat" id="signal" style="font-size:15px">…</div></div></div><section class="card"><h2>Свечной график · 1 минута</h2><div class="toolbar"><button id="zoom-in" aria-label="Приблизить график">+ Приблизить</button><button id="zoom-out" aria-label="Отдалить график">− Отдалить</button><button id="pan-left">← Раньше</button><button id="pan-right">Позже →</button><button id="latest">Последние свечи</button></div><div id="candle-chart" class="chart">Загрузка…</div><div class="legend"><span><i style="background:#486cdb"></i>Вход</span><span><i style="background:#ef923c"></i>Выход</span><span><i style="background:#d45b65"></i>Stop Loss</span><span><i style="background:#14885e"></i>Take Profit</span></div><p class="meta" id="market-meta"></p></section><section class="card"><h2>EMA 9 / EMA 21 и объём</h2><div id="indicators">Загрузка…</div></section>${runtime}<script>
let candles=[],trades=[],active=null,windowSize=100,offset=0,marketVersion=0;
function repaint(){const a=candles.filter(Boolean);candleChart($('candle-chart'),a,trades.concat(active?[active]:[]),windowSize,offset);$('market-meta').textContent=a.length+' свечей загружено · показаны '+Math.min(windowSize,Math.max(0,a.length-offset))+' · сдвиг от последней '+offset+' мин. Для прокрутки используй кнопки, колесо мыши или жест влево/вправо.'}
async function refresh(){const version=++marketVersion,symbol=$('symbol').value,limit=$('limit').value;try{
 const [market,signal]=await Promise.all([api('/api/candles?symbol='+symbol+'&limit='+limit),api('/api/signals?symbol='+symbol)]);
 if(version!==marketVersion)return;
 candles=market.candles||[];offset=0;windowSize=Math.min(100,candles.length||100);
 $('price').textContent=candles.length?cash(candles.at(-1).close):'—';$('rsi').textContent=fmt(signal.rsi14,1);$('signal').textContent=signal.signal||'—';
 $('indicators').textContent='EMA 9: '+fmt(signal.ema9,3)+' · EMA 21: '+fmt(signal.ema21,3)+' · Объём к среднему: '+fmt(signal.volumeRatio,2)+'×';
 await loadTrades(version);repaint();
 }catch(e){if(version===marketVersion)msg('candle-chart',e)}}
async function loadTrades(version=marketVersion){
 const id=Number($('account').value);trades=[];active=null;
 if(!id)return;
 try{const d=await api('/api/paper?account='+id);if(version!==marketVersion)return;trades=(d.trades||[]).filter(t=>t.symbol===$('symbol').value);active=d.position?.symbol===$('symbol').value?d.position:null}catch(e){$('market-meta').textContent='Сделки не загружены: '+String(e)}
}
$('symbol').addEventListener('change',refresh);$('limit').addEventListener('change',refresh);$('reload').addEventListener('click',refresh);
$('account').addEventListener('change',async()=>{const v=++marketVersion;await loadTrades(v);if(v===marketVersion)repaint()});
$('zoom-in').addEventListener('click',()=>{windowSize=Math.max(15,Math.floor(windowSize*.7));repaint()});
$('zoom-out').addEventListener('click',()=>{windowSize=Math.min(candles.length,Math.ceil(windowSize*1.4));offset=Math.min(offset,Math.max(0,candles.length-windowSize));repaint()});
$('pan-left').addEventListener('click',()=>{offset=Math.min(Math.max(0,candles.length-windowSize),offset+Math.max(5,Math.floor(windowSize*.5)));repaint()});
$('pan-right').addEventListener('click',()=>{offset=Math.max(0,offset-Math.max(5,Math.floor(windowSize*.5)));repaint()});
$('latest').addEventListener('click',()=>{offset=0;repaint()});
$('candle-chart').addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey){windowSize=Math.max(15,Math.min(candles.length,Math.round(windowSize*(e.deltaY>0?1.18:.85))))}else{offset=Math.max(0,Math.min(Math.max(0,candles.length-windowSize),offset+Math.sign(e.deltaY)*Math.max(2,Math.floor(windowSize*.12))))}repaint()},{passive:false});
let touchX=null;$('candle-chart').addEventListener('touchstart',e=>{if(e.touches.length===1)touchX=e.touches[0].clientX},{passive:true});
$('candle-chart').addEventListener('touchend',e=>{if(touchX===null||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(dx)<25)return;offset=Math.max(0,Math.min(Math.max(0,candles.length-windowSize),offset+(dx>0?1:-1)*Math.max(5,Math.round(Math.abs(dx)/4))));repaint()},{passive:true});
api('/api/paper-accounts').then(d=>{for(const a of d.accounts||[]){const o=document.createElement('option');o.value=String(a.id);o.textContent=a.id+'. '+a.name;$('account').appendChild(o)}}).catch(()=>{});refresh();
</script>`);

export const analyticsHtml=shell('Аналитика',`<p>Бэктесты на исторических минутных свечах. Не путать с действующими виртуальными позициями.</p><section class="card"><h2>Результат стратегий по инструментам, %</h2><div class="chart" id="backtest-chart">Загрузка…</div></section><section class="card"><h2>Подробное сравнение</h2><div class="tablewrap" id="backtest-table">Загрузка…</div></section><section class="card"><h2>Собранные рыночные данные</h2><div class="chart" id="data-chart">Загрузка…</div><div id="data-table" class="tablewrap"></div></section>${runtime}<script>
async function refresh(){try{const [back,overview]=await Promise.all([api('/api/backtest-compare'),api('/api/overview')]);const a=back.results||[];barChart($('backtest-chart'),a.map(x=>x.returnPct),a.map(x=>x.symbol.slice(0,3)+' '+x.strategy.slice(0,3)),{signed:true});table($('backtest-table'),['Монета','Стратегия','Свечей','Сделок','P&L','Побед, %','Просадка, %'],a.map(x=>[x.symbol,x.strategy,x.bars,x.trades,cash(x.netPnl),fmt(x.winRate,1),fmt(x.maxDrawdown,2)]));const b=overview.symbols||[];barChart($('data-chart'),b.map(x=>x.confirmed),b.map(x=>x.symbol.slice(0,3)));table($('data-table'),['Монета','Свечей','Период с','Последняя','Пропуски, мин'],b.map(x=>[x.symbol,x.confirmed,x.first_at,x.last_at,x.missing_minutes]))}catch(e){msg('backtest-chart',e)}}
refresh();
</script>`);
export const researchHtml=shell('Новые стратегии',`<p>Независимые исторические проверки: 70% ранних свечей для исследования, 30% поздних для контроля. Это не статистика виртуальных счетов №7–10.</p><section class="card"><h2>Контрольная выборка: доходность, %</h2><div class="chart" id="validation-chart">Загрузка…</div></section><section class="card"><h2>Доходность на ранних свечах, %</h2><div class="chart" id="training-chart">Загрузка…</div></section><section class="card"><h2>Подробные результаты</h2><div id="research-table" class="tablewrap">Загрузка…</div></section><p class="meta">OFI требует отдельного сбора стакана Bybit; результаты по нему здесь пока отсутствуют.</p>${runtime}<script>
async function refresh(){try{const d=await api('/api/research');const a=d.results||[],labels=a.map(x=>x.symbol.slice(0,3)+' '+x.candidate.slice(0,4));barChart($('validation-chart'),a.map(x=>x.validation.returnPct),labels,{signed:true});barChart($('training-chart'),a.map(x=>x.training.returnPct),labels,{signed:true});table($('research-table'),['Пара','Алгоритм','Обучение, %','Контроль, %','Контр. сделки','Просадка, %','Отбор'],a.map(x=>[x.symbol,x.candidate,fmt(x.training.returnPct),fmt(x.validation.returnPct),x.validation.trades,fmt(x.validation.maxDrawdown),x.validation.provisional?'Мало истории':'Предварительно']))}catch(e){msg('validation-chart',e)}}
refresh();
</script>`);
