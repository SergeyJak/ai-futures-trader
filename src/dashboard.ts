export const dashboardHtml = `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f6f8fc"><title>AI Futures · Paper Trading</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#172338;background:#f6f8fc}*{box-sizing:border-box}body{margin:0}.wrap{max-width:980px;margin:auto;padding:22px 16px 70px}header{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:30px}.brand{font-weight:850;letter-spacing:-.5px;font-size:23px}.brand span{color:#506ddd}.badge{display:inline-flex;align-items:center;gap:7px;border-radius:30px;padding:8px 12px;background:#eaf6ee;color:#13724b;font-size:12px;font-weight:750}.dot{width:8px;height:8px;background:currentColor;border-radius:50%}h1{font-size:clamp(26px,5vw,36px);margin:0 0 5px}h2{font-size:19px;margin:0}.sub{font-size:13px;color:#718099;margin:0}.heading{margin-bottom:22px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.card{background:#fff;border:1px solid #e4eaf5;border-radius:17px;padding:19px;box-shadow:0 2px 11px #0e224006}.label{color:#6c7b90;font-size:13px}.value{font-size:25px;font-weight:800;margin-top:10px;letter-spacing:-.4px;font-variant-numeric:tabular-nums}.note{font-size:12px;color:#8190a4;margin-top:5px}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:27px 0 13px}.status-line{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:750;color:#687992}.status-line .dot{color:#15956c}[hidden]{display:none!important}.position{display:grid;cursor:pointer}.position:focus-visible{outline:2px solid #4969d8;border-radius:10px}.position:hover{background:#f7f9ff;grid-template-columns:1.5fr repeat(3,1fr);gap:16px}.position-primary{font-size:23px;font-weight:850;margin-top:9px}.empty{padding:25px 4px;text-align:center;color:#748399;font-size:14px}.row{display:grid;grid-template-columns:1.2fr .7fr .9fr .9fr .9fr .7fr;gap:10px;align-items:center;border-bottom:1px solid #edf1f7;padding:14px 0;font-size:13px;min-width:675px}.row:last-child{border-bottom:0}.row.header{color:#8290a6;font-size:12px;font-weight:700;padding-top:4px}.table-scroll{overflow-x:auto}.positive{color:#118059}.negative{color:#c04650}.muted{color:#718099}.pill{font-size:11px;font-weight:800;border-radius:20px;padding:5px 9px;background:#eff3fa;color:#566883;display:inline-block}.foot{margin-top:30px;text-align:center;font-size:12px;color:#8490a2}.error{color:#b93442;background:#fff0f1;padding:12px;border-radius:10px}.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}@media(max-width:750px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.position{grid-template-columns:repeat(2,minmax(0,1fr))}.wrap{padding:18px 13px 50px}.card{padding:15px}.value{font-size:22px}header{margin-bottom:24px}}@media(max-width:360px){.value{font-size:20px}.position{grid-template-columns:1fr 1fr}}
.account-tabs{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}.account-tab{border:1px solid #dce5f1;background:white;color:#42516c;border-radius:12px;padding:12px 14px;font-weight:750;cursor:pointer;flex:1;min-width:135px}.account-tab.selected{background:#4969d8;color:#fff;border-color:#4969d8}.compare-card{margin-bottom:19px}.compare-row{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:10px;border-bottom:1px solid #edf1f7;padding:12px 0;font-size:13px;cursor:pointer}.compare-row:last-child{border-bottom:0}.compare-row.selected{font-weight:750;color:#4969d8}.compare-row.head{color:#8290a6;cursor:default;font-size:12px;font-weight:700}@media(max-width:750px){.account-tab{min-width:120px;padding:10px 9px}.compare-row{grid-template-columns:1.4fr .8fr .8fr .7fr;font-size:12px}}
.row.trade-row{cursor:pointer}.row.trade-row:hover{background:#f2f6ff}.row.trade-row:focus-visible{outline:2px solid #4969d8}.trade-dialog{border:0;border-radius:18px;width:min(94vw,820px);max-height:92dvh;padding:0;box-shadow:0 15px 60px #14243b44;color:#172338}.trade-dialog::backdrop{background:#17233899}.dialog-body{padding:22px}.dialog-top{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.dialog-close{cursor:pointer;border:1px solid #dae2ef;border-radius:9px;background:white;padding:8px 12px}.trade-chart{height:300px;width:100%;margin:14px 0;overflow:hidden}.trade-chart svg{width:100%;height:100%;display:block}.trade-info{color:#62728b;font-size:13px;line-height:1.7}.trade-key{display:flex;gap:16px;flex-wrap:wrap;color:#64748b;font-size:12px}@media(max-width:700px){.dialog-body{padding:14px}.trade-chart{height:265px}}nav{display:flex;flex-wrap:wrap;gap:15px;margin:0 0 23px}nav a{font-size:14px;text-decoration:none;color:#4261b9;font-weight:700}nav a.active{color:#172338}</style></head><body><main class="wrap">
<header><div class="brand">AI <span>Futures</span></div><span class="badge" id="server-status"><span class="dot"></span><span id="status-text">Подключение…</span></span></header>
<nav><a class="active" href="/">Тестовая торговля</a><a href="/analytics">Аналитика</a><a href="/market">Рынок и сигналы</a><a href="/research">Новые стратегии</a></nav><div class="heading"><h1>Тестовая торговля</h1><p class="sub">Виртуальный счёт · Bybit USDT Perpetual · без настоящих ордеров</p></div>
<div class="section-head"><h2>Десять стратегий · по $100</h2><span class="sub">Параллельный эксперимент</span></div>
<div id="account-tabs" class="account-tabs" role="group" aria-label="Виртуальные счета"></div>
<div class="card compare-card"><div class="label">Сравнение экспериментов</div><div class="table-scroll" id="account-comparison"><div class="empty">Загрузка результатов…</div></div></div>
<div class="heading" style="margin-top:24px"><h2 id="account-title">Счёт 1 · Оригинальная стратегия</h2><p class="sub" id="account-description">Исходный эксперимент, история сохранена</p></div>
<div class="grid">
<div class="card"><div class="label">Баланс</div><div class="value" id="balance">…</div><div class="note">После комиссий по исполненным операциям</div></div>
<div class="card"><div class="label">Стоимость счёта</div><div class="value" id="equity">…</div><div class="note">Баланс + открытый P&L</div></div>
<div class="card"><div class="label">Общий результат</div><div class="value" id="result">…</div><div class="note">От стартовых $100</div></div>
<div class="card"><div class="label">Закрытых сделок</div><div class="value" id="count">…</div><div class="note" id="wins">Учитываются завершённые сделки</div></div>
</div>
<div class="section-head"><h2>Текущая сделка</h2><div class="status-line"><span class="dot"></span><span id="bot-status">Проверяем состояние…</span></div></div>
<div class="card"><div id="empty-position" class="empty">Пока нет открытой сделки. Бот ожидает подходящий сигнал.</div><div id="active-position" class="position" role="button" tabindex="0" aria-label="Открыть график текущей позиции" hidden>
<div><div class="label">Монета / направление</div><div class="position-primary" id="position-symbol"></div><div class="note" id="position-opened"></div></div>
<div><div class="label">Объём</div><div class="value" id="position-qty"></div><div class="note" id="position-value"></div></div>
<div><div class="label">Цена входа</div><div class="value" id="position-entry"></div><div class="note" id="position-stop"></div></div>
<div><div class="label">Текущий P&L</div><div class="value" id="position-pnl"></div><div class="note" id="position-take"></div></div>
</div></div>
<div class="section-head"><h2>Завершённые сделки</h2><span class="sub">Последние 50 · сначала новые</span></div>
<div class="card"><div class="table-scroll" id="trades"><div class="empty">Загрузка истории…</div></div></div>
<dialog id="trade-dialog" class="trade-dialog" aria-labelledby="trade-dialog-title"><div class="dialog-body"><div class="dialog-top"><div><h2 id="trade-dialog-title">Детали сделки</h2><div id="trade-dialog-meta" class="trade-info"></div></div><button class="dialog-close" id="trade-dialog-close" type="button">Закрыть ×</button></div><div id="trade-dialog-chart" class="trade-chart">Загрузка свечей…</div><div class="trade-key"><span>● Синий: вход</span><span id="trade-exit-key">● Оранжевый: выход</span><span>Линия: время удержания</span></div><p class="trade-info" id="trade-dialog-note"></p></div></dialog><p class="foot" id="updated">Данные обновляются каждые 15 секунд. Только симуляция, реальные деньги не используются.</p>
</main><script>
'use strict';
let accountId=1;let currentAccounts=[];let requestId=0;
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const quantity=new Intl.NumberFormat('en-US',{maximumFractionDigits:6});
const el=id=>document.getElementById(id);
const set=(id,value)=>el(id).textContent=String(value);
function currencyClass(node,n){node.classList.remove('positive','negative');if(n>0)node.classList.add('positive');if(n<0)node.classList.add('negative')}
function cell(row,text,className){const e=document.createElement('div');e.textContent=String(text);if(className)e.className=className;row.appendChild(e);return e}
let modalSeq=0;
const modal=el('trade-dialog');
el('trade-dialog-close').addEventListener('click',()=>modal.close());
modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
function drawTradeChart(bars,trade,open=false){
 const chart=el('trade-dialog-chart');if(!bars.length){chart.textContent='Минутные свечи за период этой сделки пока отсутствуют в базе.';return}
 const highs=bars.map(b=>Number(b.high)),lows=bars.map(b=>Number(b.low));
 const lastClose=Number(bars.at(-1).close),exitPrice=open?lastClose:Number(trade.exit_price);const max=Math.max(...highs,Number(trade.entry_price),exitPrice),min=Math.min(...lows,Number(trade.entry_price),exitPrice);
 const padding=Math.max((max-min)*.14,max*.00002),hi=max+padding,lo=min-padding;
 const y=v=>245-(Number(v)-lo)/(hi-lo)*205;
 const left=60,right=780,width=right-left,w=width/bars.length;
 const first=Date.parse(bars[0].start_at),last=Date.parse(bars.at(-1).start_at);
 const xFor=time=>left+Math.max(0,Math.min(1,(time-first)/Math.max(60000,last-first)))*width;
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 300" preserveAspectRatio="none" role="img" aria-label="Свечи выбранной сделки с входом и выходом">';
 for(let i=0;i<5;i++){const level=hi-(hi-lo)*i/4,yy=y(level);svg+='<line x1="60" x2="790" y1="'+yy+'" y2="'+yy+'" stroke="#e5ecf4"/><text x="2" y="'+(yy+5)+'" font-size="14" fill="#697992">'+level.toFixed(2)+'</text>'}
 bars.forEach((b,i)=>{const x=left+(i+.5)*w,o=Number(b.open),close=Number(b.close),col=close>=o?'#149a70':'#d45869';svg+='<line x1="'+x+'" x2="'+x+'" y1="'+y(b.high)+'" y2="'+y(b.low)+'" stroke="'+col+'" stroke-width="1.5"/><rect x="'+(x-Math.max(1,w*.32))+'" y="'+Math.min(y(o),y(close))+'" width="'+Math.max(2,w*.64)+'" height="'+Math.max(1,Math.abs(y(o)-y(close)))+'" fill="'+col+'"><title>'+b.start_at+' O '+o+' C '+close+'</title></rect>'});
 const entryX=xFor(Date.parse(trade.entry_at)),exitX=open?xFor(last):xFor(Date.parse(trade.exit_at));
 const ey=y(trade.entry_price),xy=y(exitPrice);
 svg+='<line x1="'+entryX+'" x2="'+exitX+'" y1="'+ey+'" y2="'+xy+'" stroke="#8795ad" stroke-dasharray="5 4" stroke-width="2"/>';
 svg+='<circle cx="'+entryX+'" cy="'+ey+'" r="6" fill="#4266d3"><title>Вход '+trade.entry_price+'</title></circle>';
 svg+='<circle cx="'+exitX+'" cy="'+xy+'" r="6" fill="'+(open?'#15956c':'#ee9238')+'"><title>'+(open?'Текущая цена ':'Выход ')+exitPrice+'</title></circle>';if(open){for(const [price,label,color] of [[trade.stop,'SL','#d45b65'],[trade.take,'TP','#14885e']]){const value=Number(price);if(!Number.isFinite(value))continue;const yLevel=Math.max(25,Math.min(250,y(value)));svg+='<line x1="'+entryX+'" x2="790" y1="'+yLevel+'" y2="'+yLevel+'" stroke="'+color+'" stroke-dasharray="5 5" stroke-width="2"><title>'+label+' '+value+'</title></line>';}}
 svg+='<text x="60" y="280" font-size="14" fill="#697992">'+String(bars[0].start_at).slice(5,16)+'</text><text x="790" y="280" text-anchor="end" font-size="14" fill="#697992">'+String(bars.at(-1).start_at).slice(5,16)+'</text></svg>';
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml');if(doc.querySelector('parsererror')){chart.textContent='Ошибка построения SVG-графика';return}chart.replaceChildren(document.importNode(doc.documentElement,true));
}
async function openCurrentPosition(){
 const seq=++modalSeq;
 const id=accountId;
 set('trade-dialog-chart','Загрузка текущей позиции…');if(!modal.open)modal.showModal();
 try{
  const response=await fetch('/api/paper?account='+id,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
  const state=await response.json();if(seq!==modalSeq||!modal.open)return;
  const p=state.position;if(!p){set('trade-dialog-chart','Эта позиция уже закрыта. Посмотри историю сделок.');return}
  const entry=Date.parse(p.entryAt),now=Date.now(),from=Math.max(entry-10*60000,now-1430*60000);
  const url='/api/trade-candles?symbol='+encodeURIComponent(p.symbol)+'&from='+encodeURIComponent(new Date(from).toISOString())+'&to='+encodeURIComponent(new Date(now).toISOString());
  const candlesResponse=await fetch(url,{cache:'no-store'});if(!candlesResponse.ok)throw Error('HTTP '+candlesResponse.status);
  const result=await candlesResponse.json();if(seq!==modalSeq||!modal.open)return;
  const bars=result.candles||[];
  const price=Number(bars.at(-1)?.close),qty=Number(p.qty),unrealized=Number.isFinite(price)?(price-Number(p.entry))*qty*(p.side==='LONG'?1:-1)-price*qty*.0006:null;
  const name=currentAccounts.find(x=>x.id===id)?.name||'Счёт '+id;
  set('trade-dialog-title',p.symbol+' · '+p.side+' · открыта');
  set('trade-dialog-meta',name+' · вход '+String(p.entryAt).slice(0,16)+' UTC · '+Math.max(0,Math.round((now-entry)/60000))+' мин · текущий P&L '+(unrealized===null?'нет цены':money.format(unrealized)));
  set('trade-dialog-note','Вход '+money.format(Number(p.entry))+' · текущая цена '+(Number.isFinite(price)?money.format(price):'нет котировки')+' · SL '+money.format(Number(p.stop))+' · TP '+money.format(Number(p.take))+' · объём '+quantity.format(qty)+(from>entry?' · показаны последние 24 часа':''));
  el('trade-exit-key').textContent='● Зелёный: текущая цена';
  drawTradeChart(bars,{entry_at:p.entryAt,entry_price:p.entry,stop:p.stop,take:p.take},true);
 }catch(e){if(seq===modalSeq)set('trade-dialog-chart','Не удалось загрузить график: '+String(e))}
}
el('active-position').addEventListener('click',openCurrentPosition);
el('active-position').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCurrentPosition()}});
async function openTrade(trade){
 const seq=++modalSeq;
 el('trade-exit-key').textContent='● Оранжевый: выход';
 const entry=Date.parse(trade.entry_at),exit=Date.parse(trade.exit_at),duration=Math.round((exit-entry)/60000);
 const name=currentAccounts.find(x=>x.id===accountId)?.name||'Счёт '+accountId;
 set('trade-dialog-title',trade.symbol+' · '+trade.side);
 set('trade-dialog-meta',name+' · '+String(trade.entry_at).slice(0,16)+' → '+String(trade.exit_at).slice(0,16)+' UTC · '+duration+' мин · P&L '+money.format(Number(trade.pnl)));
 set('trade-dialog-note','Вход '+money.format(Number(trade.entry_price))+' · выход '+money.format(Number(trade.exit_price))+' · объём '+quantity.format(Number(trade.quantity))+' · '+trade.reason);
 set('trade-dialog-chart','Загрузка минутных свечей…');if(!modal.open)modal.showModal();
 try{
  const pad=Math.min(30,Math.max(5,Math.round(duration*.3)));
  const from=new Date(entry-pad*60000).toISOString(),to=new Date(exit+pad*60000).toISOString();
  const url='/api/trade-candles?symbol='+encodeURIComponent(trade.symbol)+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to);
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
  const result=await response.json();if(seq!==modalSeq||!modal.open)return;
  drawTradeChart(result.candles||[],trade);
 }catch(e){if(seq===modalSeq)set('trade-dialog-chart','Не удалось загрузить свечи: '+String(e))}
}
function renderTrades(trades){
 const root=el('trades');root.replaceChildren();
 if(!trades.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Закрытых сделок пока нет. Они появятся здесь после первого виртуального выхода из позиции.';root.appendChild(empty);return}
 let head=document.createElement('div');head.className='row header';['Монета','Направление','Открыта UTC','Закрыта UTC','Причина','Результат'].forEach(t=>cell(head,t));root.appendChild(head);
 trades.forEach(t=>{const r=document.createElement('div');r.className='row trade-row';r.tabIndex=0;r.setAttribute('role','button');r.setAttribute('aria-label','Открыть график сделки '+t.symbol);r.addEventListener('click',()=>openTrade(t));r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTrade(t)}});const pnl=Number(t.pnl);cell(r,t.symbol);cell(r,t.side==='LONG'?'LONG':'SHORT');cell(r,String(t.entry_at).slice(5,16).replace(' ',' '));cell(r,String(t.exit_at).slice(5,16));cell(r,t.reason==='STOP'?'Стоп':t.reason==='TIME'?'Время':'Цель');cell(r,(pnl>=0?'+':'')+money.format(pnl),pnl>0?'positive':pnl<0?'negative':'');root.appendChild(r)})
}
function chooseAccount(id){accountId=id;el('active-position').hidden=true;el('empty-position').hidden=false;set('bot-status','Загрузка счёта…');renderAccounts();void refresh()}
function renderAccounts(){
 const root=el('account-tabs');root.replaceChildren();
 for(const a of currentAccounts){const b=document.createElement('button');b.type='button';b.className='account-tab'+(a.id===accountId?' selected':'');b.textContent=a.id+'. '+a.name;b.addEventListener('click',()=>chooseAccount(a.id));root.appendChild(b)}
 const overview=el('account-comparison');overview.replaceChildren();
 const head=document.createElement('div');head.className='compare-row head';['Стратегия','Баланс','Позиция','P&L'].forEach(t=>cell(head,t));overview.appendChild(head);
 for(const a of currentAccounts){const row=document.createElement('div');row.className='compare-row'+(a.id===accountId?' selected':'');row.addEventListener('click',()=>chooseAccount(a.id));const gain=Number(a.balance)-100;cell(row,a.id+'. '+a.name);cell(row,money.format(Number(a.balance)));cell(row,a.position?a.position.symbol.replace('USDT','')+' '+a.position.side:'Нет');cell(row,(gain>=0?'+':'')+money.format(gain),gain>0?'positive':gain<0?'negative':'');overview.appendChild(row)}
 const chosen=currentAccounts.find(a=>a.id===accountId);if(chosen){set('account-title','Счёт '+chosen.id+' · '+chosen.name);set('account-description',chosen.id===1?'Исходный эксперимент, существующие позиции и сделки сохранены':'Стратегия: '+chosen.strategy+' · '+(chosen.id===6?'маржа до $5 · плечо до 5× · номинал до $25':'позиция до '+money.format(chosen.maxUsd))+' · удержание до '+chosen.maxMinutes+' минут · стоп '+(chosen.stop*100).toFixed(1)+'% · цель '+(chosen.take*100).toFixed(1)+'%')}
}
async function refresh(){const run=++requestId;
 try{
  const accountsResponse=await fetch('/api/paper-accounts',{cache:'no-store'});if(!accountsResponse.ok)throw Error('Accounts unavailable');const accountsData=await accountsResponse.json();if(run!==requestId)return;currentAccounts=accountsData.accounts;renderAccounts();
  const response=await fetch('/api/paper?account='+accountId,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
  const d=await response.json();if(run!==requestId)return;const balance=Number(d.balance),p=d.position;
  set('balance',money.format(balance));set('count',d.trades.length+(d.trades.length===50?'+':''));
  const won=d.trades.filter(t=>Number(t.pnl)>0).length;set('wins',d.trades.length?'Прибыльных в последних 50: '+won:'Ожидаем первые сделки');
  const ready=Boolean(d.last_at);set('status-text',ready?'Симуляция запущена':'Инициализация');
  el('server-status').style.cssText=ready?'':'background:#fff3e5;color:#aa6a20';
  let unrealized=0;
  if(p){
   el('empty-position').hidden=true;el('active-position').hidden=false;
   set('position-symbol',p.symbol.replace('USDT','')+' · '+p.side);
   set('position-qty',quantity.format(p.qty));
   set('position-entry',money.format(Number(p.entry)));
   set('position-opened','Открыта: '+String(p.entryAt).slice(0,16)+' UTC');
   set('position-value','Номинал '+money.format(Number(p.qty)*Number(p.entry)));
   set('position-stop','Стоп: '+money.format(Number(p.stop)));
   set('position-take','Цель: '+money.format(Number(p.take)));
   set('bot-status','Позиция открыта');
   const market=await fetch('/api/candles?symbol='+encodeURIComponent(p.symbol)+'&limit=1',{cache:'no-store'});
   if(market.ok){const data=await market.json();const close=Number(data.candles?.[0]?.close);if(Number.isFinite(close)&&close>0){unrealized=(close-Number(p.entry))*Number(p.qty)*(p.side==='LONG'?1:-1)-close*Number(p.qty)*.0006;set('position-pnl',(unrealized>=0?'+':'')+money.format(unrealized));currencyClass(el('position-pnl'),unrealized)}else{set('position-pnl','Нет котировки')}}
   else set('position-pnl','Нет котировки');
  }else{el('active-position').hidden=true;el('empty-position').hidden=false;set('bot-status',ready?'Ожидает сигнал':'Запускается')}
  set('equity',money.format(balance+unrealized));let total=balance+unrealized-100;set('result',(total>=0?'+':'')+money.format(total));currencyClass(el('result'),total);
  renderTrades(d.trades||[]);
  set('updated','Обновлено '+new Date().toLocaleTimeString('ru-RU')+' · новая проверка через 15 секунд · только виртуальные ордера');
 }catch(e){set('status-text','Нет связи');el('server-status').style.cssText='background:#fff0f1;color:#b93442';set('bot-status','Данные недоступны');set('updated','Не удалось загрузить состояние виртуального счёта. Повтор через 15 секунд.')}
}
refresh();setInterval(refresh,15000);
</script></body></html>`;
