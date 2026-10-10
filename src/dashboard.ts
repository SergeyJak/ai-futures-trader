export const dashboardHtml = `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f6f8fc"><title>AI Futures · Paper Trading</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#172338;background:#f6f8fc}*{box-sizing:border-box}body{margin:0}.wrap{max-width:980px;margin:auto;padding:22px 16px 70px}header{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:30px}.brand{font-weight:850;letter-spacing:-.5px;font-size:23px}.brand span{color:#506ddd}.badge{display:inline-flex;align-items:center;gap:7px;border-radius:30px;padding:8px 12px;background:#eaf6ee;color:#13724b;font-size:12px;font-weight:750}.dot{width:8px;height:8px;background:currentColor;border-radius:50%}h1{font-size:clamp(26px,5vw,36px);margin:0 0 5px}h2{font-size:19px;margin:0}.sub{font-size:13px;color:#718099;margin:0}.heading{margin-bottom:22px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.card{background:#fff;border:1px solid #e4eaf5;border-radius:17px;padding:19px;box-shadow:0 2px 11px #0e224006}.label{color:#6c7b90;font-size:13px}.value{font-size:25px;font-weight:800;margin-top:10px;letter-spacing:-.4px;font-variant-numeric:tabular-nums}.note{font-size:12px;color:#8190a4;margin-top:5px}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:27px 0 13px}.status-line{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:750;color:#687992}.status-line .dot{color:#15956c}.position{display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:16px}.position-primary{font-size:23px;font-weight:850;margin-top:9px}.empty{padding:25px 4px;text-align:center;color:#748399;font-size:14px}.row{display:grid;grid-template-columns:1.2fr .7fr .9fr .9fr .9fr .7fr;gap:10px;align-items:center;border-bottom:1px solid #edf1f7;padding:14px 0;font-size:13px;min-width:675px}.row:last-child{border-bottom:0}.row.header{color:#8290a6;font-size:12px;font-weight:700;padding-top:4px}.table-scroll{overflow-x:auto}.positive{color:#118059}.negative{color:#c04650}.muted{color:#718099}.pill{font-size:11px;font-weight:800;border-radius:20px;padding:5px 9px;background:#eff3fa;color:#566883;display:inline-block}.foot{margin-top:30px;text-align:center;font-size:12px;color:#8490a2}.error{color:#b93442;background:#fff0f1;padding:12px;border-radius:10px}.meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}@media(max-width:750px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.position{grid-template-columns:repeat(2,minmax(0,1fr))}.wrap{padding:18px 13px 50px}.card{padding:15px}.value{font-size:22px}header{margin-bottom:24px}}@media(max-width:360px){.value{font-size:20px}.position{grid-template-columns:1fr 1fr}}
</style></head><body><main class="wrap">
<header><div class="brand">AI <span>Futures</span></div><span class="badge" id="server-status"><span class="dot"></span><span id="status-text">Подключение…</span></span></header>
<div class="heading"><h1>Тестовая торговля</h1><p class="sub">Виртуальный счёт · Bybit USDT Perpetual · без настоящих ордеров</p></div>
<div class="grid">
<div class="card"><div class="label">Баланс</div><div class="value" id="balance">…</div><div class="note">После комиссий по исполненным операциям</div></div>
<div class="card"><div class="label">Стоимость счёта</div><div class="value" id="equity">…</div><div class="note">Баланс + открытый P&L</div></div>
<div class="card"><div class="label">Общий результат</div><div class="value" id="result">…</div><div class="note">От стартовых $100</div></div>
<div class="card"><div class="label">Закрытых сделок</div><div class="value" id="count">…</div><div class="note" id="wins">Учитываются завершённые сделки</div></div>
</div>
<div class="section-head"><h2>Текущая сделка</h2><div class="status-line"><span class="dot"></span><span id="bot-status">Проверяем состояние…</span></div></div>
<div class="card"><div id="empty-position" class="empty">Пока нет открытой сделки. Бот ожидает подходящий сигнал.</div><div id="active-position" class="position" hidden>
<div><div class="label">Монета / направление</div><div class="position-primary" id="position-symbol"></div><div class="note" id="position-opened"></div></div>
<div><div class="label">Объём</div><div class="value" id="position-qty"></div><div class="note" id="position-value"></div></div>
<div><div class="label">Цена входа</div><div class="value" id="position-entry"></div><div class="note" id="position-stop"></div></div>
<div><div class="label">Текущий P&L</div><div class="value" id="position-pnl"></div><div class="note" id="position-take"></div></div>
</div></div>
<div class="section-head"><h2>Завершённые сделки</h2><span class="sub">Последние 50 · сначала новые</span></div>
<div class="card"><div class="table-scroll" id="trades"><div class="empty">Загрузка истории…</div></div></div>
<p class="foot" id="updated">Данные обновляются каждые 15 секунд. Только симуляция, реальные деньги не используются.</p>
</main><script>
'use strict';
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const quantity=new Intl.NumberFormat('en-US',{maximumFractionDigits:6});
const el=id=>document.getElementById(id);
const set=(id,value)=>el(id).textContent=String(value);
function currencyClass(node,n){node.classList.remove('positive','negative');if(n>0)node.classList.add('positive');if(n<0)node.classList.add('negative')}
function cell(row,text,className){const e=document.createElement('div');e.textContent=String(text);if(className)e.className=className;row.appendChild(e);return e}
function renderTrades(trades){
 const root=el('trades');root.replaceChildren();
 if(!trades.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Закрытых сделок пока нет. Они появятся здесь после первого виртуального выхода из позиции.';root.appendChild(empty);return}
 let head=document.createElement('div');head.className='row header';['Монета','Направление','Открыта UTC','Закрыта UTC','Причина','Результат'].forEach(t=>cell(head,t));root.appendChild(head);
 trades.forEach(t=>{const r=document.createElement('div');r.className='row';const pnl=Number(t.pnl);cell(r,t.symbol);cell(r,t.side==='LONG'?'LONG':'SHORT');cell(r,String(t.entry_at).slice(5,16).replace(' ',' '));cell(r,String(t.exit_at).slice(5,16));cell(r,t.reason==='STOP'?'Стоп':'Цель');cell(r,(pnl>=0?'+':'')+money.format(pnl),pnl>0?'positive':pnl<0?'negative':'');root.appendChild(r)})
}
async function refresh(){
 try{
  const response=await fetch('/api/paper',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
  const d=await response.json();const balance=Number(d.balance),p=d.position;
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
